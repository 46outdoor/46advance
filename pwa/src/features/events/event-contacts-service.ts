/**
 * Per-event contact attachments (`events/{eventId}/contacts/{attachId}`). Co-located in the
 * events feature; the global directory lives in @/lib/contacts. An attachment is a join doc
 * referencing a directory contact + a role-on-this-event label. Reads/writes gated by
 * firestore.rules (member read; PM/admin write). Contact details resolve from the directory.
 */
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { z } from 'zod';
import { db, functions } from '@/services/firebase';
import { listContacts } from '@/lib/contacts/contacts-service';
import type { Contact } from '@/lib/contacts/contact';
import type {
  DetachEventContactInput,
  DetachEventContactOutput,
} from '@contracts/callables/crewLogistics';

export interface EventContactAttachment {
  id: string;
  contactId: string;
  roleLabel: string | null;
  /** Event-specific note about this crew member; not stored on the global contact. */
  notes: string | null;
}

/** A resolved attachment: the join row + its directory contact (null if it was deleted). */
export interface ResolvedEventContact {
  attachment: EventContactAttachment;
  contact: Contact | null;
}

const attachmentDocSchema = z.object({
  contactId: z.string().min(1),
  roleLabel: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

function eventContactsCol(eventId: string) {
  return collection(db, 'events', eventId, 'contacts');
}

/** Attached contacts for an event, resolved against the directory, sorted by name. */
export async function listEventContacts(eventId: string): Promise<ResolvedEventContact[]> {
  const [attachSnap, directory] = await Promise.all([
    getDocs(eventContactsCol(eventId)),
    listContacts(),
  ]);
  const byId = new Map(directory.map((c) => [c.id, c]));
  return attachSnap.docs
    .map((d) => {
      const parsed = attachmentDocSchema.parse(d.data());
      return {
        attachment: {
          id: d.id,
          contactId: parsed.contactId,
          roleLabel: parsed.roleLabel ?? null,
          notes: parsed.notes ?? null,
        },
        contact: byId.get(parsed.contactId) ?? null,
      };
    })
    .sort((a, b) => (a.contact?.name ?? '').localeCompare(b.contact?.name ?? ''));
}

export async function attachContact(
  eventId: string,
  contactId: string,
  roleLabel: string | null,
  addedBy: string,
): Promise<string> {
  const ref = await addDoc(eventContactsCol(eventId), {
    contactId,
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
