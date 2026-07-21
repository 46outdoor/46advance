/**
 * One-time migration: move production-record `attachments` arrays into the
 * `attachments/{id}` subcollection under each production record
 * (`events/{e}/production/record` and `events/{e}/stages/{s}/production/record`).
 * Idempotent: each record's array is migrated + deleted in one atomic batch, so
 * re-running is a no-op.
 *
 * Run once, after deploying the rules:
 *   gcloud auth application-default login
 *   GOOGLE_CLOUD_PROJECT=<project> CONFIRM_PROJECT=<same project> node --import tsx scripts/migrate-attachments-to-subcollection.ts
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Destructive-run guard (WS-D): refuse unless the caller explicitly confirms the exact target
// project, so this migration can never run against the wrong (e.g. production) project by accident.
const TARGET_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
if (!TARGET_PROJECT || process.env.CONFIRM_PROJECT !== TARGET_PROJECT) {
  console.error(
    `Refusing to run: this migration deletes the legacy field on project ` +
      `"${TARGET_PROJECT || '(GOOGLE_CLOUD_PROJECT unset)'}". Re-run with ` +
      `GOOGLE_CLOUD_PROJECT=<project> CONFIRM_PROJECT=<same project>.`,
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function main(): Promise<void> {
  // `production` only appears as events/{e}/production and events/{e}/stages/{s}/production.
  const records = await db.collectionGroup('production').get();
  let recordsMigrated = 0;
  let filesMigrated = 0;

  for (const rec of records.docs) {
    const raw: unknown = rec.get('attachments');
    if (!Array.isArray(raw) || raw.length === 0) continue;

    const batch = db.batch();
    let count = 0;
    for (const a of raw) {
      if (a === null || typeof a !== 'object') continue;
      batch.set(rec.ref.collection('attachments').doc(), a as Record<string, unknown>);
      count++;
    }
    batch.update(rec.ref, { attachments: FieldValue.delete() });
    await batch.commit();

    recordsMigrated++;
    filesMigrated += count;
    console.log(`Migrated ${count} attachment(s) for ${rec.ref.path}`);
  }

  console.log(`Done. ${recordsMigrated} record(s), ${filesMigrated} attachment(s) migrated.`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
