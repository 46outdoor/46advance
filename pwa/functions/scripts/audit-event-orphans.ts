/**
 * Read-only orphan inventory (S10 / F-7): reports the leftovers of the pre-S10, non-cascading
 * client deletes — nested subcollection docs whose parent no longer exists, and quote / production
 * Storage objects with no referencing Firestore doc.
 *
 * REPORT ONLY. Never deletes. Cleaning any of it is a separate, explicitly-approved step; the
 * new deleteAdvance / deleteStage / deleteQuote callables prevent NEW orphans from forming.
 *
 * Run (from functions/):
 *   gcloud auth application-default login   # account with Firestore + Storage read on the project
 *   GOOGLE_CLOUD_PROJECT=advancethat npx -y tsx scripts/audit-event-orphans.ts
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
if (!PROJECT) {
  console.error('Refusing to run: set GOOGLE_CLOUD_PROJECT to the project to inventory.');
  process.exit(1);
}
const BUCKET = `${PROJECT}.firebasestorage.app`;

if (getApps().length === 0) initializeApp({ credential: applicationDefault() });
const db = getFirestore();

// Cache parent-existence so many children under one parent don't re-read it.
const parentCache = new Map<string, boolean>();
async function exists(ref: DocumentReference): Promise<boolean> {
  const cached = parentCache.get(ref.path);
  if (cached !== undefined) return cached;
  const e = (await ref.get()).exists;
  parentCache.set(ref.path, e);
  return e;
}

/** Docs in a collection-group whose immediate parent doc no longer exists. */
async function orphanDocs(groupId: string): Promise<string[]> {
  const snap = await db.collectionGroup(groupId).get();
  const out: string[] = [];
  for (const d of snap.docs) {
    const parent = d.ref.parent.parent;
    if (parent && !(await exists(parent))) out.push(d.ref.path);
  }
  return out;
}

async function main(): Promise<void> {
  console.log(`Event orphan inventory (READ-ONLY) — project: ${PROJECT}`);

  // Firestore: subtree docs left under a missing parent by the old non-cascading client deletes.
  for (const group of ['advances', 'quotes', 'driveFiles', 'documents', 'attachments']) {
    const orphans = await orphanDocs(group);
    console.log(`\n=== ${group}: ${orphans.length} orphaned (parent missing) ===`);
    orphans.forEach((p) => console.log(`  ${p}`));
  }

  // Storage: quote objects whose quote doc is gone, and production objects with no attachment doc.
  const quoteIds = new Set((await db.collectionGroup('quotes').get()).docs.map((d) => d.id));
  const attachmentPaths = new Set(
    (await db.collectionGroup('attachments').get()).docs
      .map((d) => d.get('path') as string | undefined)
      .filter((p): p is string => !!p),
  );
  const [files] = await getStorage().bucket(BUCKET).getFiles({ prefix: 'events/' });
  const orphanStorage: string[] = [];
  for (const f of files) {
    const parts = f.name.split('/'); // events/{e}/{kind}/...
    if (parts[2] === 'quotes' && parts[3] && !quoteIds.has(parts[3])) orphanStorage.push(f.name);
    else if (parts[2] === 'production' && !attachmentPaths.has(f.name)) orphanStorage.push(f.name);
    // events/{e}/packets/* are generated PDFs, unreferenced from Firestore by design — skipped.
  }
  console.log(`\n=== Storage objects with no referencing doc: ${orphanStorage.length} ===`);
  orphanStorage.forEach((p) => console.log(`  ${p}`));

  console.log('\nThis report is advisory only — nothing was modified.');
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
