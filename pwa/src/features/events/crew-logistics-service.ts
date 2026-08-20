/**
 * Crew travel & lodging IO (`events/{eventId}/crewLogistics/**` —
 * planning/CREW_TRAVEL_LODGING_PLAN.md §4.3/§4.4). Reads are the delicate part: Firestore
 * evaluates a LIST against the query, not the returned documents, so a non-manager issuing
 * the unconstrained query is denied outright even though every document they'd receive is
 * theirs. `listCrewLogistics` therefore takes the resolved `canViewAll` (from
 * `canViewAllCrewLogistics`) and picks the query itself — call sites never choose a scope.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import {
  compareCrewLogistics,
  parseCrewLogistics,
  type CrewLogisticsInput,
  type CrewLogisticsRecord,
} from '@/lib/logistics/crewLogistics';
import { createLogger } from '@/lib/logger';

const logger = createLogger('CrewLogisticsService');

/** React Query key for an event's crew logistics; scope is part of the key so a permission
 *  change (e.g. PM on this event vs not) can never serve the wrong cached scope. */
export function crewLogisticsKey(eventId: string, scope: 'all' | 'self'): readonly unknown[] {
  return ['events', 'crewLogistics', eventId, scope];
}

function col(eventId: string) {
  return collection(db, 'events', eventId, 'crewLogistics');
}

/**
 * List the records the viewer may see. `canViewAll` MUST be the result of
 * `canViewAllCrewLogistics` — passing anything else re-opens the list-query trap.
 */
export async function listCrewLogistics(
  eventId: string,
  viewerUid: string,
  canViewAll: boolean,
): Promise<CrewLogisticsRecord[]> {
  const q = canViewAll ? col(eventId) : query(col(eventId), where('userId', '==', viewerUid));
  const snap = await getDocs(q);
  const records: CrewLogisticsRecord[] = [];
  for (const d of snap.docs) {
    try {
      records.push(parseCrewLogistics(d.id, d.data()));
    } catch (err) {
      // One malformed record must not blank the whole panel.
      logger.error(`Skipping malformed crewLogistics doc ${d.id}`, err);
    }
  }
  return records.sort(compareCrewLogistics);
}

/**
 * Create a record for a crew-roster attachment. The identity triple
 * (eventContactId, contactId, userId) is derived HERE from the attachment + directory
 * contact — never accepted from the form — and the rules re-verify all three server-side.
 */
export async function createCrewLogistics(
  eventId: string,
  attachId: string,
  input: CrewLogisticsInput,
  createdBy: string,
): Promise<string> {
  const identity = await resolveIdentity(eventId, attachId);
  const ref = await addDoc(col(eventId), {
    ...serializeInput(input),
    ...identity,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Update a record's content fields; the identity triple is re-derived and re-proven. */
export async function updateCrewLogistics(
  eventId: string,
  recordId: string,
  attachId: string,
  input: CrewLogisticsInput,
): Promise<void> {
  const identity = await resolveIdentity(eventId, attachId);
  await updateDoc(doc(db, 'events', eventId, 'crewLogistics', recordId), {
    ...serializeInput(input),
    ...identity,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCrewLogistics(eventId: string, recordId: string): Promise<void> {
  await deleteDoc(doc(db, 'events', eventId, 'crewLogistics', recordId));
}

/** attachment → {eventContactId, contactId, userId}; throws when the attachment is gone. */
async function resolveIdentity(
  eventId: string,
  attachId: string,
): Promise<{ eventContactId: string; contactId: string; userId: string | null }> {
  const attach = await getDoc(doc(db, 'events', eventId, 'contacts', attachId));
  const contactId = attach.get('contactId') as string | undefined;
  if (!attach.exists() || !contactId) {
    throw new Error('That crew member is no longer on this event.');
  }
  const contact = await getDoc(doc(db, 'contacts', contactId));
  const userId = (contact.get('userId') as string | null | undefined) ?? null;
  return { eventContactId: attachId, contactId, userId };
}

/** Input → stored shape. Every key of the kind is written (nulls included) so the rules'
 *  `keys().hasOnly` check sees one canonical shape and updates can clear a field. */
function serializeInput(input: CrewLogisticsInput): Record<string, unknown> {
  if (input.kind === 'lodging') {
    return {
      kind: 'lodging',
      hotelName: input.hotelName,
      address: input.address ?? null,
      hotelPhone: input.hotelPhone ?? null,
      confirmation: input.confirmation ?? null,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      roomType: input.roomType ?? null,
      roomNumber: input.roomNumber ?? null,
      notes: input.notes ?? null,
    };
  }
  return {
    kind: 'travel',
    mode: input.mode,
    carrier: input.carrier ?? null,
    confirmation: input.confirmation ?? null,
    from: input.from ?? null,
    to: input.to ?? null,
    departAt: input.departAt ?? null,
    arriveAt: input.arriveAt ?? null,
    departTimeZone: input.departTimeZone ?? null,
    arriveTimeZone: input.arriveTimeZone ?? null,
    notes: input.notes ?? null,
  };
}
