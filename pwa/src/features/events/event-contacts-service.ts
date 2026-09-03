/**
 * Per-event contact attachments (`events/{eventId}/contacts/{attachId}`). Co-located in the
 * events feature; the global directory lives in @/lib/contacts. An attachment is a join doc
 * referencing a directory contact + a role-on-this-event label. Reads/writes gated by
 * firestore.rules (member read; PM/admin/coordinator write).
 *
 * ⚠ **Crew details are DENORMALIZED onto the join, deliberately**
 * (planning/ACCESS_SCOPING_PLAN.md §4.2). This used to resolve every attachment against the
 * global directory — `listContacts()` on every event page load, for every member. That is
 * incompatible with narrowing `contacts/{id}` to the global capabilities, because a tech has
 * no directory read at all; and it was already wasteful (a 1000-doc list to name three crew).
 * So each attachment carries a `contact` SNAPSHOT of the display fields, and the roster reads
 * one member-gated collection.
 *
 * The snapshot is DISPLAY data, not authorization data — nothing in `firestore.rules` reads
 * it, which is why a client may write it. (Contrast `crewLogistics.userId`, which gates reads
 * of room numbers and is therefore server-owned; see CREW_TRAVEL_LODGING_PLAN §4.2. Do not
 * copy the pattern here into anything a rule consults.) Freshness is the
 * `reconcileCrewContactsOnContactWrite` trigger's job.
 */
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { db, functions } from '@/services/firebase';
import { timestampToDate } from '@/lib/firestore/timestamps';
import type { Contact } from '@/lib/contacts/contact';
import type {
  DetachEventContactInput,
  DetachEventContactOutput,
} from '@contracts/callables/crewLogistics';

/**
 * The directory fields copied onto the attachment so crew can see (and reach) the people on
 * their own show without reading the global directory. Deliberately the "contact card" set —
 * decision 2 of ACCESS_SCOPING_PLAN — and deliberately NOT `userId`, which is authorization
 * data and stays server-owned on the records that gate on it.
 */
export interface CrewContactSnapshot {
  name: string;
  role: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
}

export interface EventContactAttachment {
  id: string;
  contactId: string;
  roleLabel: string | null;
  /** Event-specific note about this crew member; not stored on the global contact. */
  notes: string | null;
  /**
   * Set when the directory entry behind this attachment was deleted (stamped by the
   * reconcile trigger). The snapshot survives — who was on the show is event history — so the
   * roster keeps the name and flags it as gone rather than blanking the row.
   */
  contactDeletedAt: Date | null;
}

/**
 * A resolved attachment: the join row + the crew member's details.
 *
 * `contact` is null only for an attachment written before the snapshot existed and not yet
 * backfilled — NOT for a deleted directory entry, which keeps its snapshot and sets
 * `attachment.contactDeletedAt` instead.
 */
export interface ResolvedEventContact {
  attachment: EventContactAttachment;
  contact: CrewContactSnapshot | null;
}

const snapshotSchema = z.object({
  name: z.string().min(1),
  role: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

const attachmentDocSchema = z.object({
  contactId: z.string().min(1),
  roleLabel: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  contact: snapshotSchema.nullable().optional(),
  contactDeletedAt: z.instanceof(Timestamp).nullable().optional(),
});

function eventContactsCol(eventId: string) {
  return collection(db, 'events', eventId, 'contacts');
}

/** The snapshot payload for a directory contact — the one place the copy's shape is decided. */
export function crewContactSnapshot(
  contact: Pick<Contact, 'name' | 'role' | 'company' | 'phone' | 'email'>,
): CrewContactSnapshot {
  return {
    name: contact.name,
    role: contact.role ?? null,
    company: contact.company ?? null,
    phone: contact.phone ?? null,
    email: contact.email ?? null,
  };
}

/**
 * Attached crew for an event, sorted by name. One read of a member-gated subcollection — no
 * directory join (see the file header). An unsnapshotted legacy row sorts last under ''.
 */
export async function listEventContacts(eventId: string): Promise<ResolvedEventContact[]> {
  const attachSnap = await getDocs(eventContactsCol(eventId));
  return attachSnap.docs
    .map((d) => {
      const parsed = attachmentDocSchema.parse(d.data());
      const snapshot = parsed.contact ?? null;
      return {
        attachment: {
          id: d.id,
          contactId: parsed.contactId,
          roleLabel: parsed.roleLabel ?? null,
          notes: parsed.notes ?? null,
          contactDeletedAt: timestampToDate(parsed.contactDeletedAt ?? null),
        },
        contact: snapshot
          ? {
              name: snapshot.name,
              role: snapshot.role ?? null,
              company: snapshot.company ?? null,
              phone: snapshot.phone ?? null,
              email: snapshot.email ?? null,
            }
          : null,
      };
    })
    .sort((a, b) => (a.contact?.name ?? '').localeCompare(b.contact?.name ?? ''));
}

/**
 * Attach a directory contact to an event's crew. The caller passes the contact itself (it
 * comes from the picker, which only a directory-reader can open), so the snapshot is written
 * with the attachment — a crew member can then be rendered without any directory access.
 */
export async function attachContact(
  eventId: string,
  contact: Pick<Contact, 'id' | 'name' | 'role' | 'company' | 'phone' | 'email'>,
  roleLabel: string | null,
  addedBy: string,
): Promise<string> {
  const ref = await addDoc(eventContactsCol(eventId), {
    contactId: contact.id,
    contact: crewContactSnapshot(contact),
    contactDeletedAt: null,
    roleLabel: roleLabel?.trim() || null,
    addedBy,
    addedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Set this crew member's event-specific note (stored on the join, not the directory contact). */
export async function setEventContactNotes(
  eventId: string,
  attachId: string,
  notes: string | null,
): Promise<void> {
  await updateDoc(doc(db, 'events', eventId, 'contacts', attachId), {
    notes: notes?.trim() || null,
  });
}

/**
 * Detach a crew member — server-owned since 2026-08-20 (CREW_TRAVEL_LODGING_PLAN §4.2): the
 * direct delete is refused by rules because crewLogistics records reference the attachment
 * and only the server can run that dependent query. The callable throws
 * `failed-precondition` while travel/lodging records still reference this person.
 */
export async function detachContact(eventId: string, attachId: string): Promise<void> {
  const callable = httpsCallable<DetachEventContactInput, DetachEventContactOutput>(
    functions,
    'detachEventContact',
  );
  await callable({ eventId, attachId });
}
