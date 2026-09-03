/**
 * Crew-roster contact snapshots (planning/ACCESS_SCOPING_PLAN.md §4.2).
 *
 * Each `events/{eventId}/contacts/{attachId}` attachment carries a copy of its directory
 * contact's display fields, so an event member can see and reach the people on their own show
 * without reading the global `contacts` directory — which is a cross-event surface gated on a
 * global capability. This module is the freshness half of that bargain: when a directory entry
 * is edited or deleted, every attachment referencing it is brought back into line.
 *
 * Deliberately SEPARATE from `crewLogistics.ts`, which reconciles the denormalized `userId` on
 * the same trigger path. That field is authorization data with a strict consistency model
 * (see that file's header); this one is display data, and conflating the two would put a
 * cosmetic name change on the same footing as a change that decides who may read a room
 * number. Two small triggers on `contacts/{contactId}`, one concern each.
 *
 * Eventually consistent by design: a stale name for a few seconds is a cosmetic defect, and
 * Firestore's trigger retries are the backstop. Nothing in `firestore.rules` reads these
 * fields — if that ever changes, this model is no longer adequate.
 */
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { ChunkedBatch } from './lib/db/chunkedBatch.js';

/** The display fields copied onto an attachment. Mirrors `CrewContactSnapshot` on the client. */
export interface CrewContactSnapshot {
  name: string;
  role: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Build the snapshot from a directory contact's raw data (null when the contact is gone). */
export function snapshotFromContact(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return null;
  const name = str(data.name);
  if (!name) return null;
  return {
    name,
    role: str(data.role),
    company: str(data.company),
    phone: str(data.phone),
    email: str(data.email),
  } satisfies CrewContactSnapshot;
}

/** True when two snapshots are field-for-field identical (nulls included). */
export function sameSnapshot(
  a: CrewContactSnapshot | null,
  b: CrewContactSnapshot | null,
): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.name === b.name &&
    a.role === b.role &&
    a.company === b.company &&
    a.phone === b.phone &&
    a.email === b.email
  );
}

/**
 * An attachment lives at `events/{eventId}/contacts/{attachId}` — depth 4.
 *
 * ⚠ The per-event subcollection and the GLOBAL directory are both named `contacts`, so
 * `collectionGroup('contacts')` matches the directory's own documents too. The `contactId`
 * filter already excludes them (a directory entry has no such field), but this check makes the
 * intent explicit rather than resting on the absence of a field: a write aimed at an
 * attachment must never land on a directory entry.
 */
function isEventAttachment(ref: FirebaseFirestore.DocumentReference): boolean {
  const parent = ref.parent.parent;
  return parent !== null && parent.parent?.id === 'events';
}

/**
 * Refresh every crew attachment referencing `contactId`.
 *
 * `snapshot === null` means the directory entry is gone: the copy is KEPT (who was on a show
 * is event history, and blanking the roster would be a worse answer than a stale card) and
 * `contactDeletedAt` is stamped so the UI can say so. A contact that reappears under the same
 * id clears the stamp. Returns how many attachments were rewritten.
 */
export async function reconcileCrewContactSnapshots(
  db: Firestore,
  contactId: string,
  snapshot: CrewContactSnapshot | null,
): Promise<number> {
  const attachments = await db
    .collectionGroup('contacts')
    .where('contactId', '==', contactId)
    .get();
  const batch = new ChunkedBatch(db);
  let rewritten = 0;
  for (const doc of attachments.docs) {
    if (!isEventAttachment(doc.ref)) continue;
    const current = (doc.get('contact') ?? null) as CrewContactSnapshot | null;
    const deletedAt = doc.get('contactDeletedAt') ?? null;
    if (snapshot === null) {
      if (deletedAt !== null) continue; // already flagged
      batch.set(doc.ref, { contactDeletedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      if (sameSnapshot(current, snapshot) && deletedAt === null) continue;
      batch.set(doc.ref, { contact: snapshot, contactDeletedAt: null }, { merge: true });
    }
    rewritten += 1;
  }
  await batch.commit();
  return rewritten;
}

/**
 * Keep the crew-roster copies aligned with the directory. Fires on every `contacts/{id}` write
 * but exits immediately unless a COPIED field actually changed — most contact writes (notes,
 * photo, the `userId` link, audit stamps) touch nothing this module owns.
 */
export const reconcileCrewContactsOnContactWrite = onDocumentWritten(
  'contacts/{contactId}',
  async (event) => {
    const before = snapshotFromContact(event.data?.before?.data());
    const after = event.data?.after?.exists ? snapshotFromContact(event.data.after.data()) : null;
    // A deletion still needs work even though `after` is null and may equal `before` when the
    // contact was already unnamed — but in that case there is nothing to stamp either.
    if (sameSnapshot(before, after)) return;
    const contactId = event.params.contactId;
    const rewritten = await reconcileCrewContactSnapshots(getFirestore(), contactId, after);
    if (rewritten > 0) {
      logger.info('crew contact snapshots reconciled', {
        contactId,
        deleted: after === null,
        rewritten,
      });
    }
  },
);
