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
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { dateToTimestamp } from '@/lib/firestore/timestamps';
import { parseEvent, type EventInput, type EventRecord, type EventStatus } from '@/lib/events/event';
import type { Viewer } from '@/lib/rbac/permissions';

/** Create an event + add the creator as its production-manager. Returns the new event id. */
export async function createEvent(input: EventInput, creatorUid: string): Promise<string> {
  const eventRef = doc(collection(db, 'events'));
  const batch = writeBatch(db);
  batch.set(eventRef, {
    name: input.name,
    startDate: dateToTimestamp(input.startDate ?? null),
    endDate: dateToTimestamp(input.endDate ?? null),
    venue: input.venue ?? null,
    status: input.status ?? 'draft',
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'events', eventRef.id, 'members', creatorUid), {
    role: 'production-manager',
    addedBy: creatorUid,
    addedAt: serverTimestamp(),
    uid: creatorUid,
  });
  await batch.commit();
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
    ...(input.status ? { status: input.status } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function setEventStatus(eventId: string, status: EventStatus): Promise<void> {
  await updateDoc(doc(db, 'events', eventId), { status, updatedAt: serverTimestamp() });
}
