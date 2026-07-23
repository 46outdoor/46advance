/**
 * Read-only provenance audit (WS-A.9) for the Drive-backed record collections.
 *
 * The S2 register callables (registerArtistDocument / registerEventDocument /
 * includeArtistDocumentOnAdvance) verify, server-side, that a file actually belongs to the
 * library root or the event's linked folder before recording it, and stamp the canonical
 * source metadata. Records created BEFORE S2 (by the old client write paths) never went
 * through that check — this script reports the ones the current rules/callables would no
 * longer accept, so a human can decide what to do about them.
 *
 * REPORT ONLY. This script never writes or deletes anything. Any cleanup of the flagged
 * records is a separate, explicitly-approved step (there is no delete path here on purpose).
 *
 * Two independent signals per record:
 *   1. Structural (always runs, Firestore only): the record is missing the provenance fields
 *      the register callables always write (e.g. artistDocuments without `sourceFolderId` /
 *      `importedAt`, event docs without `webViewLink` / `uploadedAt`) — a strong "pre-S2,
 *      client-created" marker.
 *   2. Drive membership (runs only when DRIVE_SA_KEY is provided): re-verify, via the broker
 *      service account, that the file is still reachable and still lives under the expected
 *      library-root / event folder — exactly the check the register callable performs.
 *
 * Run (from functions/, matching the sibling scripts — tsx is fetched by npx, not a dep):
 *   gcloud auth application-default login   # one-time; an account with Firestore read on the project
 *   # structural pass only (no Drive check, no key needed):
 *   GOOGLE_CLOUD_PROJECT=advancethat npx -y tsx scripts/audit-drive-record-provenance.ts
 *   # full pass — pull the broker key straight from Secret Manager (no local file):
 *   GOOGLE_CLOUD_PROJECT=advancethat \
 *     DRIVE_SA_KEY="$(gcloud secrets versions access latest --secret=DRIVE_SA_KEY --project=advancethat)" \
 *     npx -y tsx scripts/audit-drive-record-provenance.ts
 *
 * DRIVE_SA_KEY is optional: without it the Drive-membership pass is skipped and only the
 * structural signal is reported (the run says so explicitly).
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { google, type drive_v3 } from 'googleapis';
import { getFileForRegistration, resolveArtistFolder } from '../src/lib/broker/driveProvenance.js';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
if (!PROJECT) {
  console.error('Refusing to run: set GOOGLE_CLOUD_PROJECT to the project you want to audit.');
  process.exit(1);
}

// Mirror googleDrive.ts — the library folder walk is depth-capped the same way.
const MAX_FOLDER_DEPTH = 10;

/** A record flagged as unverifiable, with every reason it tripped. */
interface Finding {
  path: string;
  reasons: string[];
}

/** Broker Drive client from the SA key in the environment, or null to skip the Drive pass.
 *  Read-only scope — this script can only look, never touch. */
function brokerClient(): drive_v3.Drive | null {
  const key = process.env.DRIVE_SA_KEY;
  if (!key) return null;
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(key) as Record<string, unknown>,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

/** True if any listed field is absent/empty on the record — the register callables always set them. */
function missingFields(data: FirebaseFirestore.DocumentData, fields: string[]): string[] {
  return fields.filter((f) => data[f] === undefined || data[f] === null || data[f] === '');
}

async function auditArtistDocuments(
  db: Firestore,
  drive: drive_v3.Drive | null,
): Promise<Finding[]> {
  const rootFolderId = (await db.doc('config/documentsLibrary').get()).get('rootFolderId') as
    string | undefined;
  const snap = await db.collection('artistDocuments').get();
  const findings: Finding[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const reasons: string[] = [];
    const missing = missingFields(data, [
      'sourceFolderId',
      'artistKey',
      'importedAt',
      'webViewLink',
    ]);
    if (missing.length) reasons.push(`missing provenance fields: ${missing.join(', ')}`);

    if (drive) {
      if (!rootFolderId) {
        reasons.push(
          'library root (config/documentsLibrary.rootFolderId) not configured — cannot verify',
        );
      } else {
        const file = await getFileForRegistration(drive, doc.id);
        if (!file) {
          reasons.push(
            'Drive file is not accessible to the broker (deleted or moved out of the library)',
          );
        } else {
          const folder = await resolveArtistFolder(
            drive,
            file.parents[0] ?? null,
            rootFolderId,
            MAX_FOLDER_DEPTH,
          );
          if (!folder.underRoot)
            reasons.push('Drive file is not under the document-library root folder');
        }
      }
    }
    if (reasons.length) findings.push({ path: doc.ref.path, reasons });
  }
  return findings;
}

async function auditEventDocuments(
  db: Firestore,
  drive: drive_v3.Drive | null,
): Promise<Finding[]> {
  const events = await db.collection('events').get();
  const findings: Finding[] = [];
  for (const event of events.docs) {
    const driveFolderId = event.get('driveFolderId') as string | undefined;
    const docs = await event.ref.collection('documents').get();
    for (const doc of docs.docs) {
      const data = doc.data();
      const reasons: string[] = [];
      const missing = missingFields(data, ['webViewLink', 'mimeType', 'uploadedAt']);
      if (missing.length) reasons.push(`missing provenance fields: ${missing.join(', ')}`);

      if (drive) {
        if (!driveFolderId) {
          reasons.push('event has no linked Drive folder — cannot verify membership');
        } else {
          const file = await getFileForRegistration(drive, doc.id);
          if (!file) reasons.push('Drive file is not accessible to the broker (deleted or moved)');
          else if (!file.parents.includes(driveFolderId))
            reasons.push("Drive file is not in the event's linked folder");
        }
      }
      if (reasons.length) findings.push({ path: doc.ref.path, reasons });
    }
  }
  return findings;
}

/** Advance documents are server-copied from a canonical artistDocuments row; a missing source
 *  means the inclusion can no longer be traced to a verified library record. */
async function auditAdvanceDocuments(db: Firestore): Promise<Finding[]> {
  const docs = await db.collectionGroup('documents').get();
  const findings: Finding[] = [];
  for (const doc of docs.docs) {
    // collectionGroup('documents') matches BOTH event docs and advance docs; keep only advance docs.
    if (!doc.ref.path.includes('/advances/')) continue;
    const source = await db.doc(`artistDocuments/${doc.id}`).get();
    if (!source.exists) {
      findings.push({
        path: doc.ref.path,
        reasons: [`source artistDocuments/${doc.id} no longer exists (orphaned inclusion)`],
      });
    }
  }
  return findings;
}

function report(title: string, findings: Finding[]): void {
  console.log(`\n=== ${title} — ${findings.length} flagged ===`);
  for (const f of findings) {
    console.log(`  ${f.path}`);
    for (const r of f.reasons) console.log(`      - ${r}`);
  }
}

async function main(): Promise<void> {
  if (getApps().length === 0) initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const drive = brokerClient();

  console.log(`Provenance audit (READ-ONLY) — project: ${PROJECT}`);
  console.log(
    drive
      ? 'Drive membership pass: ENABLED (broker SA provided).'
      : 'Drive membership pass: SKIPPED (no DRIVE_SA_KEY) — structural signal only.',
  );

  const [artist, eventDocs, advanceDocs] = await Promise.all([
    auditArtistDocuments(db, drive),
    auditEventDocuments(db, drive),
    auditAdvanceDocuments(db),
  ]);

  report('artistDocuments (library)', artist);
  report('event documents', eventDocs);
  report('advance documents (inclusions)', advanceDocs);

  const total = artist.length + eventDocs.length + advanceDocs.length;
  console.log(
    `\nTotal flagged: ${total}. This report is advisory only — no records were modified.`,
  );
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
