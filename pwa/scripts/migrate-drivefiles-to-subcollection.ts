/**
 * One-time migration: move advance `driveFiles` arrays into the
 * `events/{e}/stages/{s}/advances/{a}/driveFiles/{fileId}` subcollection
 * (the new home — see refactor/drivefiles-subcollection). Idempotent: re-running
 * is safe (per-file docs are merged by fileId; the legacy array field is deleted).
 *
 * Run once, after deploying the rules + functions:
 *   gcloud auth application-default login
 *   node --import tsx scripts/migrate-drivefiles-to-subcollection.ts
 *
 * Reads Admin credentials from ADC; pins the project from GOOGLE_CLOUD_PROJECT /
 * gcloud's default. No-op if there are no advances with a legacy array.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function main(): Promise<void> {
  const advances = await db.collectionGroup('advances').get();
  let advancesMigrated = 0;
  let filesMigrated = 0;

  for (const adv of advances.docs) {
    const raw: unknown = adv.get('driveFiles');
    if (!Array.isArray(raw) || raw.length === 0) continue;

    const batch = db.batch();
    let count = 0;
    for (const f of raw) {
      const fileId = (f as { fileId?: unknown }).fileId;
      if (typeof fileId !== 'string' || fileId.length === 0) continue;
      batch.set(adv.ref.collection('driveFiles').doc(fileId), f as Record<string, unknown>, { merge: true });
      count++;
    }
    batch.update(adv.ref, { driveFiles: FieldValue.delete() });
    await batch.commit();

    advancesMigrated++;
    filesMigrated += count;
    console.log(`Migrated ${count} file(s) for ${adv.ref.path}`);
  }

  console.log(`Done. ${advancesMigrated} advance(s), ${filesMigrated} file(s) migrated.`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
