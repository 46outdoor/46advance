/**
 * One-shot cleanup for the schedule redesign (PR 5): deletes every event's pre-redesign
 * `scheduleItems` and `scheduleNotes` docs, plus any `scheduleTemplates` doc still in
 * the old shape (no `days[].items` — superseded by the day-first model; reseed the
 * stagehand template afterwards with seed-stagehand-labor-template.ts). The redesigned
 * collections (`scheduleDays`, day-first templates) are untouched. Idempotent.
 *
 * Run (from functions/):
 *   gcloud auth application-default login   # one-time
 *   GOOGLE_CLOUD_PROJECT=advancethat CONFIRM_PROJECT=advancethat npx -y tsx scripts/cleanup-old-schedule-data.ts
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';

// Destructive-run guard (WS-D): refuse unless the caller explicitly confirms the exact target
// project, so this can never delete data from the wrong (e.g. production) project by accident.
const TARGET_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
if (!TARGET_PROJECT || process.env.CONFIRM_PROJECT !== TARGET_PROJECT) {
  console.error(
    `Refusing to run: this deletes data from project ` +
      `"${TARGET_PROJECT || '(GOOGLE_CLOUD_PROJECT unset)'}". Re-run with ` +
      `GOOGLE_CLOUD_PROJECT=<project> CONFIRM_PROJECT=<same project>.`,
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function deleteAll(refs: DocumentReference[], label: string): Promise<number> {
  for (const ref of refs) await ref.delete();
  if (refs.length > 0) console.log(`Deleted ${refs.length} ${label}.`);
  return refs.length;
}

async function main(): Promise<void> {
  let total = 0;
  const events = await db.collection('events').get();
  for (const event of events.docs) {
    for (const sub of ['scheduleItems', 'scheduleNotes']) {
      const snap = await event.ref.collection(sub).get();
      total += await deleteAll(
        snap.docs.map((d) => d.ref),
        `${sub} under ${event.id}`,
      );
    }
  }

  // Templates: `kind` is the discriminator — every redesign writer (client service,
  // reseed script) sets it; no pre-redesign writer ever did. Shape-sniffing days[]
  // instead would misclassify a legitimate freshly-created template (zero days yet)
  // as legacy and delete it. A doc WITH `kind` may still retain the old top-level
  // `items` field from a merge-reseed — strip just that stale field.
  const templates = await db.collection('scheduleTemplates').get();
  const oldShape = templates.docs.filter((d) => typeof d.data().kind !== 'string');
  total += await deleteAll(
    oldShape.map((d) => d.ref),
    'pre-redesign scheduleTemplates',
  );
  const staleItemsField = templates.docs.filter(
    (d) => typeof d.data().kind === 'string' && Array.isArray(d.data().items),
  );
  for (const d of staleItemsField) {
    await d.ref.update({ items: FieldValue.delete() });
    console.log(`Stripped stale items field from scheduleTemplates/${d.id}.`);
    total += 1;
  }

  console.log(total === 0 ? 'Nothing to clean up.' : `Done — ${total} docs removed.`);
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
