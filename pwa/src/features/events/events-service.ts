/**
 * Event/festival data access. Reads/writes are enforced by firestore.rules
 * (create: admin|organizer; update: PM|admin). Creating an event also adds the
 * creator as that event's production-manager (one batch) so they can edit it.
 */
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, functions, storage } from '@/services/firebase';
import { dateToTimestamp } from '@/lib/firestore/timestamps';
import { parseEvent, type EventInput, type EventRecord, type EventStatus } from '@/lib/events/event';
import type { Viewer } from '@/lib/rbac/permissions';

/**
 * Create an event, then add the creator as its production-manager.
 * Sequential (not batched): the membership rule verifies `createdBy` via get(),
 * which can only see the event once it's committed.
 */
export async function createEvent(input: EventInput, creatorUid: string): Promise<string> {
  const eventRef = doc(collection(db, 'events'));
  await setDoc(eventRef, {
    name: input.name,
    startDate: dateToTimestamp(input.startDate ?? null),
    endDate: dateToTimestamp(input.endDate ?? null),
    venue: input.venue ?? null,
    status: input.status ?? 'draft',
    departmentIds: input.departmentIds ?? [],
    bookingLabel: input.bookingLabel?.trim() ? input.bookingLabel.trim() : null,
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'events', eventRef.id, 'members', creatorUid), {
    role: 'production-manager',
    addedBy: creatorUid,
    addedAt: serverTimestamp(),
    uid: creatorUid,
  });
  return eventRef.id;
}

export async function getEvent(eventId: string): Promise<EventRecord | null> {
  const snap = await getDoc(doc(db, 'events', eventId));
  return snap.exists() ? parseEvent(snap.id, snap.data()) : null;
}

/** Events the viewer can see: all (admin) or those they're a member of. */
export async function listEvents(viewer: Viewer): Promise<EventRecord[]> {
  let events: EventRecord[];
  if (viewer.isAdmin) {
    const snap = await getDocs(collection(db, 'events'));
    events = snap.docs.map((d) => parseEvent(d.id, d.data()));
  } else {
    const memberSnap = await getDocs(
      query(collectionGroup(db, 'members'), where('uid', '==', viewer.uid)),
    );
    const eventIds = memberSnap.docs
      .map((d) => d.ref.parent.parent?.id)
      .filter((id): id is string => Boolean(id));
    const fetched = await Promise.all(eventIds.map((id) => getEvent(id)));
    events = fetched.filter((e): e is EventRecord => e !== null);
  }
  return events.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateEvent(eventId: string, input: EventInput): Promise<void> {
  await updateDoc(doc(db, 'events', eventId), {
    name: input.name,
    startDate: dateToTimestamp(input.startDate ?? null),
    endDate: dateToTimestamp(input.endDate ?? null),
    venue: input.venue ?? null,
    bookingLabel: input.bookingLabel?.trim() ? input.bookingLabel.trim() : null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.departmentIds ? { departmentIds: input.departmentIds } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function setEventStatus(eventId: string, status: EventStatus): Promise<void> {
  await updateDoc(doc(db, 'events', eventId), { status, updatedAt: serverTimestamp() });
}

/**
 * Generate a 46-branded full-event PDF packet (server-side render). The callable
 * uploads to `events/{id}/packets/{ts}.pdf` and returns its Storage path; we resolve
 * a member-gated download URL (storage.rules enforce read access). Returns the URL.
 */
export async function generatePacket(eventId: string): Promise<string> {
  const callable = httpsCallable<{ eventId: string }, { path: string }>(functions, 'generatePacket');
  const result = await callable({ eventId });
  return getDownloadURL(ref(storage, result.data.path));
}

/** Create an event from a template (clones the blueprint server-side). Returns the new id. */
export async function createEventFromTemplate(templateId: string, input: EventInput): Promise<string> {
  const callable = httpsCallable<
    { templateId: string; name: string; startDate: number | null; endDate: number | null; venue: string | null },
    { eventId: string }
  >(functions, 'createEventFromTemplate');
  const result = await callable({
    templateId,
    name: input.name,
    startDate: input.startDate ? input.startDate.getTime() : null,
    endDate: input.endDate ? input.endDate.getTime() : null,
    venue: input.venue ?? null,
  });
  return result.data.eventId;
}
