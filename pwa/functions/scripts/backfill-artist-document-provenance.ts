/**
 * One-off heal (WS-A.9 follow-up): backfill the derived provenance fields on artist-library
 * documents that predate the S2 register callable — the records the provenance audit flags as
 * missing `sourceFolderId` (and, defensively, `artist` / `artistKey`).
 *
 * For each such record it re-resolves the file's artist subfolder via the broker service account,
 * exactly as `registerArtistDocument` does (same folder-walk depth), and — ONLY when the file is
 * confirmed still under the library root — writes the missing field(s). A record whose file is
 * not under the root (or is inaccessible to the broker) is left untouched and reported as a
 * review candidate, not healed. It never overwrites an existing value (merge of absent fields
 * only), so it is safe to re-run: a healed record no longer qualifies on the next pass.
 *
 * Pair it with `audit-drive-record-provenance.ts` — audit first to see what's flagged, heal,
 * then audit again to confirm.
 *
 * Run (from functions/):
 *   gcloud auth application-default login   # one-time; an account with Firestore read/write on the project
 *   GOOGLE_CLOUD_PROJECT=advancethat CONFIRM_PROJECT=advancethat \
 *     DRIVE_SA_KEY="$(gcloud secrets versions access latest --secret=DRIVE_SA_KEY --project=advancethat)" \
 *     npx -y tsx scripts/backfill-artist-document-provenance.ts
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { google, type drive_v3 } from 'googleapis';
import { getFileForRegistration, resolveArtistFolder } from '../src/lib/broker/driveProvenance.js';

// Destructive-run guard (WS-D): refuse unless the caller confirms the exact target project, so a
// backfill can never write to the wrong (e.g. production) project by accident.
const TARGET_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
if (!TARGET_PROJECT || process.env.CONFIRM_PROJECT !== TARGET_PROJECT) {
  console.error(
    `Refusing to run: this writes provenance fields on project ` +
      `"${TARGET_PROJECT || '(GOOGLE_CLOUD_PROJECT unset)'}". Re-run with ` +
      `GOOGLE_CLOUD_PROJECT=<project> CONFIRM_PROJECT=<same project>.`,
  );
  process.exit(1);
}

const SA_KEY = process.env.DRIVE_SA_KEY;
if (!SA_KEY) {
  console.error(
    "Refusing to run: DRIVE_SA_KEY is required to re-resolve each file's library folder.",
  );
  process.exit(1);
}

// Match registerArtistDocument's folder walk (googleDrive.ts MAX_FOLDER_DEPTH), so "under root"
// is decided identically to the callable that stamps these fields at registration time.
const MAX_FOLDER_DEPTH = 12;

/** Normalize an artist name to a key — mirrors googleDrive.ts / pwa src/lib/documents/artistDocument.ts. */
function artistKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function brokerClient(): drive_v3.Drive {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(SA_KEY) as Record<string, unknown>,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

async function main(): Promise<void> {
  if (getApps().length === 0) initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const drive = brokerClient();

  const rootFolderId = (await db.doc('config/documentsLibrary').get()).get('rootFolderId') as
    string | undefined;
  if (!rootFolderId) {
    console.error('Refusing to run: config/documentsLibrary.rootFolderId is not configured.');
    process.exit(1);
  }

  console.log(`Provenance backfill — project: ${TARGET_PROJECT}, library root: ${rootFolderId}`);
  const snap = await db.collection('artistDocuments').get();

  let healed = 0;
  let skipped = 0;
  let alreadyComplete = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.sourceFolderId && data.artist && data.artistKey) {
      alreadyComplete += 1;
      continue;
    }

    const file = await getFileForRegistration(drive, doc.id);
    if (!file) {
      console.log(
        `  SKIP ${doc.ref.path} — file not accessible to the broker (deleted/moved; review candidate)`,
      );
      skipped += 1;
      continue;
    }
    const folder = await resolveArtistFolder(
      drive,
      file.parents[0] ?? null,
      rootFolderId,
      MAX_FOLDER_DEPTH,
    );
    if (!folder.underRoot) {
      console.log(`  SKIP ${doc.ref.path} — file not under the library root (review candidate)`);
      skipped += 1;
      continue;
    }

    // Write only the absent fields, and only when there's a real value to write (a file that
    // sits directly in root is legitimately "unsorted" — artistFolderId/artistName null — so
    // leave those be rather than stamping nulls).
    const update: Record<string, unknown> = {};
    if (!data.sourceFolderId && folder.artistFolderId)
      update.sourceFolderId = folder.artistFolderId;
    if (!data.artist && folder.artistName) update.artist = folder.artistName;
    if (!data.artistKey && folder.artistName) update.artistKey = artistKey(folder.artistName);

    if (Object.keys(update).length === 0) {
      console.log(
        `  SKIP ${doc.ref.path} — under root but unsorted (no artist subfolder to derive from)`,
      );
      skipped += 1;
      continue;
    }

    await doc.ref.set(update, { merge: true });
    console.log(`  HEAL ${doc.ref.path} — set ${Object.keys(update).join(', ')}`);
    healed += 1;
  }

  console.log(
    `\nDone. Healed ${healed}, skipped ${skipped} (review candidates / unsorted), already-complete ${alreadyComplete}.`,
  );
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
