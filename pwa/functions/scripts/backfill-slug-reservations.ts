/**
 * Slug reservation backfill + duplicate audit (WS-G / S12). The canonical `slugs/{slug}`
 * reservation collection is new: events created before S12 have a `slug` field but no matching
 * reservation doc, so a fresh create could hand out a slug an old event already uses. This
 * script (1) AUDITS existing event slugs for duplicates and (2) backfills a `slugs/{slug}`
 * reservation for every event that lacks one.
 *
 * DEFAULT = report-only (dups + what WOULD be reserved). Pass `--commit` to write reservations.
 * Duplicates are NEVER auto-resolved — the report lists them so they can be renamed by hand
 * (via the app) first; a duplicate's reservation is assigned to the FIRST event seen and the
 * clash is flagged.
 *
 * Run (from functions/):
 *   gcloud auth application-default login   # account with Firestore read/write on the project
 *   GOOGLE_CLOUD_PROJECT=advancethat npx -y tsx scripts/backfill-slug-reservations.ts           # report
 *   GOOGLE_CLOUD_PROJECT=advancethat npx -y tsx scripts/backfill-slug-reservations.ts --commit   # write
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
if (!PROJECT) {
  console.error('Refusing to run: set GOOGLE_CLOUD_PROJECT to the project to backfill.');
  process.exit(1);
}
const COMMIT = process.argv.includes('--commit');

if (getApps().length === 0) initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function main(): Promise<void> {
  console.log(`Slug reservation backfill — project: ${PROJECT} — mode: ${COMMIT ? 'COMMIT' : 'REPORT-ONLY'}`);

  const events = (await db.collection('events').get()).docs;
  const bySlug = new Map<string, string[]>(); // slug -> [eventId, …]
  for (const e of events) {
    const slug = e.get('slug');
    if (typeof slug !== 'string' || !slug) continue;
    (bySlug.get(slug) ?? bySlug.set(slug, []).get(slug)!).push(e.id);
  }

  // 1) Duplicate audit — two+ events sharing one slug (the silent-collision the old best-effort
  //    create/rename could produce). These need a manual rename before enforcement is airtight.
  const dups = [...bySlug.entries()].filter(([, ids]) => ids.length > 1);
  console.log(`\n=== Duplicate slugs: ${dups.length} ===`);
  dups.forEach(([slug, ids]) => console.log(`  "${slug}" → ${ids.join(', ')}  (reservation → ${ids[0]})`));

  // 2) Backfill — reserve every event slug that has no reservation doc yet. A reservation that
  //    already exists is left as-is (idempotent); a mismatched owner is flagged, never overwritten.
  let toWrite = 0;
  let alreadyOk = 0;
  const conflicts: string[] = [];
  for (const [slug, ids] of bySlug) {
    const owner = ids[0];
    const ref = db.collection('slugs').doc(slug);
    const snap = await ref.get();
    if (snap.exists) {
      if (snap.get('eventId') === owner) alreadyOk += 1;
      else conflicts.push(`"${slug}" reserved by ${snap.get('eventId')}, event doc owner is ${owner}`);
      continue;
    }
    toWrite += 1;
    console.log(`  ${COMMIT ? 'reserving' : 'would reserve'} "${slug}" → ${owner}`);
    if (COMMIT) await ref.set({ eventId: owner, createdAt: FieldValue.serverTimestamp() });
  }

  console.log(`\n=== Summary ===`);
  console.log(`  events with a slug:     ${[...bySlug.values()].reduce((n, ids) => n + ids.length, 0)}`);
  console.log(`  distinct slugs:         ${bySlug.size}`);
  console.log(`  duplicates:             ${dups.length}`);
  console.log(`  reservations already ok:${alreadyOk}`);
  console.log(`  reservations ${COMMIT ? 'written' : 'to write'}:  ${toWrite}`);
  if (conflicts.length) {
    console.log(`  owner conflicts:        ${conflicts.length}`);
    conflicts.forEach((c) => console.log(`    ${c}`));
  }
  if (!COMMIT) console.log('\nReport only — nothing was modified. Re-run with --commit to write reservations.');
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
