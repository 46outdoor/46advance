/**
 * One-time backfill: denormalize the directory contact's display fields onto every
 * `events/{e}/contacts/{attachId}` crew attachment (planning/ACCESS_SCOPING_PLAN.md §4.2).
 *
 * Attachments written since that change carry a `contact` snapshot (the Crew panel writes it at
 * attach time) and the `reconcileCrewContactsOnContactWrite` trigger keeps it fresh. Rows from
 * before have nothing — and once `contacts/{id}` narrows to the global capabilities, an event
 * member cannot resolve them client-side, so an unbackfilled row renders as "Unknown contact".
 *
 * ⚠ RUN THIS BEFORE DEPLOYING THE RULES CHANGE (plan §6 step 2). It is the difference between
 * a crew roster that still names people and one that does not.
 *
 * Idempotent + non-destructive: only `contact` and `contactDeletedAt` are ever written
 * (updateMask + exists precondition), and a row whose snapshot already matches the directory is
 * skipped. An attachment whose directory entry is gone is stamped `contactDeletedAt` and keeps
 * whatever snapshot it has — who was on a show is event history.
 *
 * Pure REST + built-in fetch (no npm deps — runs from pwa/ directly), following the house rule
 * to prefer gcloud access tokens for Firestore scripts. The Admin-SDK/gRPC route rejects
 * user-credential tokens; REST accepts them.
 *
 * Dry-run first, then apply:
 *   GCLOUD_ACCESS_TOKEN=$(./scripts/cli/gcloud-safe.sh auth print-access-token) \
 *     GOOGLE_CLOUD_PROJECT=<project> CONFIRM_PROJECT=<same project> DRY_RUN=1 \
 *     npx tsx scripts/backfill-crew-contact-snapshots.ts
 *   ...review the log, then re-run without DRY_RUN=1.
 */

// Wrong-project guard (WS-D): refuse unless the caller explicitly confirms the target.
const TARGET_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
if (!TARGET_PROJECT || process.env.CONFIRM_PROJECT !== TARGET_PROJECT) {
  console.error(
    `Refusing to run: this backfill writes crew attachment docs on project ` +
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
// x-goog-user-project: user-credential tokens otherwise bill the gcloud OAuth client's own
// project rather than this one.
const AUTH_HEADER = {
  Authorization: `Bearer ${TOKEN}`,
  'x-goog-user-project': TARGET_PROJECT,
};

/** The copied display fields. Mirrors `CrewContactSnapshot` on the client and in functions. */
const SNAPSHOT_KEYS = ['name', 'role', 'company', 'phone', 'email'] as const;
type SnapshotKey = (typeof SNAPSHOT_KEYS)[number];
type Snapshot = Record<SnapshotKey, string | null>;

interface RestValue {
  stringValue?: string;
  nullValue?: null;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, RestValue> };
}
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

function str(fields: Record<string, RestValue> | undefined, key: string): string | null {
  const v = fields?.[key]?.stringValue;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Every crew attachment, via a collection-group runQuery.
 *
 * ⚠ `contacts` is also the GLOBAL directory's collection id, so this query returns directory
 * entries too. They are filtered out by document depth — an attachment lives at
 * events/{e}/contacts/{a} — which is the same guard the trigger applies.
 */
async function listAttachments(): Promise<RestDocument[]> {
  const res = await api(`${FIRESTORE}/documents:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: 'contacts', allDescendants: true }] },
    }),
  });
  const rows = (await res.json()) as Array<{ document?: RestDocument }>;
  return rows
    .flatMap((r) => (r.document ? [r.document] : []))
    .filter((d) => {
      const path = d.name.split('/documents/')[1] ?? '';
      const parts = path.split('/');
      return parts.length === 4 && parts[0] === 'events' && parts[2] === 'contacts';
    });
}

async function getContact(contactId: string): Promise<RestDocument | null> {
  const res = await api(`${FIRESTORE}/documents/contacts/${contactId}`);
  return res.status === 404 ? null : ((await res.json()) as RestDocument);
}

function snapshotOf(contact: RestDocument): Snapshot | null {
  const name = str(contact.fields, 'name');
  if (!name) return null;
  return {
    name,
    role: str(contact.fields, 'role'),
    company: str(contact.fields, 'company'),
    phone: str(contact.fields, 'phone'),
    email: str(contact.fields, 'email'),
  };
}

function existingSnapshot(attachment: RestDocument): Snapshot | null {
  const fields = attachment.fields?.contact?.mapValue?.fields;
  if (!fields) return null;
  const name = str(fields, 'name');
  if (!name) return null;
  return {
    name,
    role: str(fields, 'role'),
    company: str(fields, 'company'),
    phone: str(fields, 'phone'),
    email: str(fields, 'email'),
  };
}

function same(a: Snapshot | null, b: Snapshot | null): boolean {
  if (a === null || b === null) return a === b;
  return SNAPSHOT_KEYS.every((k) => a[k] === b[k]);
}

const value = (s: string | null): RestValue =>
  s === null ? { nullValue: null } : { stringValue: s };

/** Patch ONLY the two denormalized fields, requiring the attachment to still exist. */
async function patchAttachment(
  docName: string,
  snapshot: Snapshot | null,
  deleted: boolean,
): Promise<void> {
  const fields: Record<string, RestValue> = {
    contactDeletedAt: deleted ? { timestampValue: new Date().toISOString() } : { nullValue: null },
  };
  const masks = ['updateMask.fieldPaths=contactDeletedAt'];
  if (snapshot) {
    fields.contact = {
      mapValue: {
        fields: Object.fromEntries(SNAPSHOT_KEYS.map((k) => [k, value(snapshot[k])])),
      },
    };
    masks.push('updateMask.fieldPaths=contact');
  }
  const url =
    `https://firestore.googleapis.com/v1/${docName}?` +
    `${masks.join('&')}&currentDocument.exists=true`;
  await api(url, { method: 'PATCH', body: JSON.stringify({ fields }) });
}

async function main(): Promise<void> {
  const attachments = await listAttachments();
  // One directory read per distinct contact, not per attachment — the same person is commonly
  // on several shows.
  const contactCache = new Map<string, RestDocument | null>();
  let updated = 0;
  let skipped = 0;
  let orphaned = 0;
  let malformed = 0;

  for (const attachment of attachments) {
    const path = attachment.name.split('/documents/')[1] ?? attachment.name;
    const contactId = str(attachment.fields, 'contactId');
    if (!contactId) {
      malformed++;
      console.warn(`No contactId on ${path} — left as-is`);
      continue;
    }
    if (!contactCache.has(contactId)) contactCache.set(contactId, await getContact(contactId));
    const contact = contactCache.get(contactId) ?? null;
    const wanted = contact ? snapshotOf(contact) : null;
    const already = existingSnapshot(attachment);
    const flagged = attachment.fields?.contactDeletedAt?.timestampValue !== undefined;

    if (wanted === null) {
      // The directory entry is gone (or unnamed). Keep any existing copy; just flag it once.
      if (flagged) {
        skipped++;
        continue;
      }
      orphaned++;
      console.log(
        `${DRY_RUN ? '[dry-run] would flag' : 'flag'} ${path}: contact ${contactId} is gone` +
          `${already ? ` (keeping the copy for “${already.name}”)` : ' (no copy to keep)'}`,
      );
      if (!DRY_RUN) await patchAttachment(attachment.name, null, true);
      continue;
    }
    if (same(already, wanted) && !flagged) {
      skipped++;
      continue;
    }
    updated++;
    console.log(
      `${DRY_RUN ? '[dry-run] would set' : 'set'} ${path}: ` +
        `name=${wanted.name} company=${wanted.company ?? 'null'} phone=${wanted.phone ?? 'null'} ` +
        `email=${wanted.email ?? 'null'}`,
    );
    if (!DRY_RUN) await patchAttachment(attachment.name, wanted, false);
  }

  console.log(
    `\n${DRY_RUN ? '[dry-run] ' : ''}Done. ${updated} snapshot(s) written, ` +
      `${orphaned} flagged as removed from the directory, ${skipped} already current, ` +
      `${malformed} malformed. ${attachments.length} attachment(s) scanned.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
