/**
 * One-time backfill: denormalize `email` + `displayName` onto legacy
 * `events/{e}/members/{uid}` docs. Rows written since Team & access (#229) carry
 * both fields (the assignEventMember callable + creator seeds write them); rows
 * from before show a raw uid in the Team roster, because non-admin PMs can't
 * read the users directory to resolve names client-side.
 *
 * Idempotent + non-destructive: docs that already have an `email` key are
 * skipped, and only the two display fields are ever written. Display name
 * resolution matches the callable: admin-set users/{uid}.displayName first,
 * then the Auth record's displayName, else null (UI falls back to email).
 * Accounts deleted from Auth are left untouched (logged).
 *
 * Dry-run first, then apply:
 *   gcloud auth application-default login   # once
 *   GOOGLE_CLOUD_PROJECT=<project> CONFIRM_PROJECT=<same project> DRY_RUN=1 \
 *     node --import tsx scripts/backfill-member-display.ts
 *   ...review the log, then re-run without DRY_RUN=1.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Wrong-project guard (WS-D): refuse unless the caller explicitly confirms the target.
const TARGET_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
if (!TARGET_PROJECT || process.env.CONFIRM_PROJECT !== TARGET_PROJECT) {
  console.error(
    `Refusing to run: this backfill writes member docs on project ` +
      `"${TARGET_PROJECT || '(GOOGLE_CLOUD_PROJECT unset)'}". Re-run with ` +
      `GOOGLE_CLOUD_PROJECT=<project> CONFIRM_PROJECT=<same project>.`,
  );
  process.exit(1);
}
const DRY_RUN = process.env.DRY_RUN === '1';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

function trimmedOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

async function main(): Promise<void> {
  const members = await db.collectionGroup('members').get();
  let updated = 0;
  let skipped = 0;
  let missingAccount = 0;

  for (const m of members.docs) {
    if (m.get('email') !== undefined) {
      skipped++; // already denormalized (written by the callable / creator seed)
      continue;
    }
    const uid: string = (m.get('uid') as string | undefined) ?? m.id;

    let authUser;
    try {
      authUser = await getAuth().getUser(uid);
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/user-not-found') {
        missingAccount++;
        console.warn(`No Auth account for ${m.ref.path} (uid ${uid}) — left as-is`);
        continue;
      }
      throw err;
    }
    const userSnap = await db.doc(`users/${uid}`).get();
    const email = authUser.email ?? null;
    const displayName =
      trimmedOrNull(userSnap.get('displayName')) ?? trimmedOrNull(authUser.displayName);

    console.log(
      `${DRY_RUN ? '[dry-run] would set' : 'set'} ${m.ref.path}: ` +
        `email=${email ?? 'null'} displayName=${displayName ?? 'null'}`,
    );
    if (!DRY_RUN) await m.ref.update({ email, displayName });
    updated++;
  }

  console.log(
    `Done${DRY_RUN ? ' (dry run — nothing written)' : ''}. ` +
      `${updated} backfilled, ${skipped} already denormalized, ${missingAccount} without an Auth account.`,
  );
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
