/**
 * One-time backfill: denormalize `email` + `displayName` onto legacy
 * `events/{e}/members/{uid}` docs. Rows written since Team & access (#229) carry
 * both fields (the assignEventMember callable + creator seeds write them); rows
 * from before show a raw uid in the Team roster, because non-admin PMs can't
 * read the users directory to resolve names client-side.
 *
 * Idempotent + non-destructive: docs that already have an `email` key are
 * skipped, and only the two display fields are ever written (updateMask +
 * exists precondition). Display name resolution matches the callable:
 * admin-set users/{uid}.displayName first, then the Auth record, else null
 * (UI falls back to email). Accounts deleted from Auth are left untouched.
 *
 * Pure REST + built-in fetch (no npm deps — runs from pwa/ directly), following
 * the house rule to prefer gcloud access tokens for Firestore scripts. The
 * Admin-SDK/gRPC route rejects user-credential tokens; REST accepts them.
 *
 * Dry-run first, then apply:
 *   GCLOUD_ACCESS_TOKEN=$(./scripts/cli/gcloud-safe.sh auth print-access-token) \
 *     GOOGLE_CLOUD_PROJECT=<project> CONFIRM_PROJECT=<same project> DRY_RUN=1 \
 *     npx tsx scripts/backfill-member-display.ts
 *   ...review the log, then re-run without DRY_RUN=1.
 */

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
const TOKEN = process.env.GCLOUD_ACCESS_TOKEN?.trim();
if (!TOKEN) {
  console.error(
    'GCLOUD_ACCESS_TOKEN is required: $(./scripts/cli/gcloud-safe.sh auth print-access-token)',
  );
  process.exit(1);
}
const DRY_RUN = process.env.DRY_RUN === '1';

const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${TARGET_PROJECT}/databases/(default)`;
// x-goog-user-project: user-credential tokens otherwise bill the gcloud OAuth client's
// own project, where identitytoolkit is disabled (accessNotConfigured).
const AUTH_HEADER = {
  Authorization: `Bearer ${TOKEN}`,
  'x-goog-user-project': TARGET_PROJECT,
};

/** Firestore REST value: {stringValue} | {nullValue} | ... */
type RestValue = { stringValue?: string; nullValue?: null };
interface RestDocument {
  name: string;
  fields?: Record<string, RestValue>;
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    headers: { ...AUTH_HEADER, 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`);
  }
  return res;
}

function str(doc: RestDocument | null, key: string): string | null {
  const v = doc?.fields?.[key]?.stringValue;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** All events/{e}/members/{uid} docs via a collection-group runQuery. */
async function listMemberDocs(): Promise<RestDocument[]> {
  const res = await api(`${FIRESTORE}/documents:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: 'members', allDescendants: true }] },
    }),
  });
  const rows = (await res.json()) as Array<{ document?: RestDocument }>;
  return rows.flatMap((r) => (r.document ? [r.document] : []));
}

/** Auth account lookup (Identity Toolkit); null when the account no longer exists. */
async function lookupAccount(
  uid: string,
): Promise<{ email: string | null; displayName: string | null } | null> {
  const res = await api(
    `https://identitytoolkit.googleapis.com/v1/projects/${TARGET_PROJECT}/accounts:lookup`,
    { method: 'POST', body: JSON.stringify({ localId: [uid] }) },
  );
  const data = (await res.json()) as {
    users?: Array<{ email?: string; displayName?: string }>;
  };
  const u = data.users?.[0];
  if (!u) return null;
  return {
    email: u.email?.trim() ? u.email.trim() : null,
    displayName: u.displayName?.trim() ? u.displayName.trim() : null,
  };
}

async function getUserDoc(uid: string): Promise<RestDocument | null> {
  const res = await api(`${FIRESTORE}/documents/users/${uid}`);
  return res.status === 404 ? null : ((await res.json()) as RestDocument);
}

/** Patch ONLY email/displayName, requiring the doc to still exist. */
async function patchMember(
  docName: string,
  email: string | null,
  displayName: string | null,
): Promise<void> {
  const value = (s: string | null): RestValue =>
    s === null ? { nullValue: null } : { stringValue: s };
  const url =
    `https://firestore.googleapis.com/v1/${docName}` +
    `?updateMask.fieldPaths=email&updateMask.fieldPaths=displayName&currentDocument.exists=true`;
  await api(url, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { email: value(email), displayName: value(displayName) } }),
  });
}

async function main(): Promise<void> {
  const members = await listMemberDocs();
  let updated = 0;
  let skipped = 0;
  let missingAccount = 0;

  for (const m of members) {
    if (m.fields && 'email' in m.fields) {
      skipped++; // already denormalized (written by the callable / creator seed)
      continue;
    }
    const path = m.name.split('/documents/')[1] ?? m.name;
    const uid = str(m, 'uid') ?? (m.name.split('/').pop() as string);

    const account = await lookupAccount(uid);
    if (!account) {
      missingAccount++;
      console.warn(`No Auth account for ${path} (uid ${uid}) — left as-is`);
      continue;
    }
    const userDoc = await getUserDoc(uid);
    const displayName = str(userDoc, 'displayName') ?? account.displayName;

    console.log(
      `${DRY_RUN ? '[dry-run] would set' : 'set'} ${path}: ` +
        `email=${account.email ?? 'null'} displayName=${displayName ?? 'null'}`,
    );
    if (!DRY_RUN) await patchMember(m.name, account.email, displayName);
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
