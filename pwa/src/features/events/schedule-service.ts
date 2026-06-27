/**
 * Schedule item data access (`events/{e}/scheduleItems/{id}`, Phase 12a). Co-located in the
 * events feature; model + section registry in @/lib/schedules. Reads/writes gated by
 * firestore.rules (member read; PM/admin write). Times stored as UTC Timestamps.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import type {
  PushScheduleItemInput,
  PushScheduleItemOutput,
  RemoveScheduleCalendarEventInput,
  RemoveScheduleCalendarEventOutput,
} from '@contracts/callables/schedules';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/services/firebase';
import { dateToTimestamp } from '@/lib/firestore/timestamps';
import { parseScheduleItem, type ScheduleItem, type ScheduleItemInput } from '@/lib/schedules/scheduleItem';

function itemsCol(eventId: string) {
  return collection(db, 'events', eventId, 'scheduleItems');
}
function itemDoc(eventId: string, itemId: string) {
  return doc(db, 'events', eventId, 'scheduleItems', itemId);
}

/** All schedule items for an event, ordered by start time then title. */
export async function listScheduleItems(eventId: string): Promise<ScheduleItem[]> {
  const snap = await getDocs(itemsCol(eventId));
  return snap.docs
    .map((d) => parseScheduleItem(d.id, d.data()))
    .sort(
      (a, b) =>
        (a.startAt?.getTime() ?? Infinity) - (b.startAt?.getTime() ?? Infinity) ||
        a.title.localeCompare(b.title),
    );
}

function toDoc(input: ScheduleItemInput) {
  return {
    section: input.section,
    customLabel: input.customLabel?.trim() || null,
    title: input.title,
    startAt: dateToTimestamp(input.startAt ?? null),
    endAt: dateToTimestamp(input.endAt ?? null),
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
    stageId: input.stageId?.trim() || null,
    advanceId: input.advanceId?.trim() || null,
    fields: input.fields ?? {},
    includeInMaster: input.includeInMaster ?? true,
  };
}

export async function createScheduleItem(
  eventId: string,
  input: ScheduleItemInput,
  creatorUid: string,
): Promise<string> {
  const ref = await addDoc(itemsCol(eventId), {
    ...toDoc(input),
    order: 0,
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateScheduleItem(
  eventId: string,
  itemId: string,
  input: ScheduleItemInput,
): Promise<void> {
  await updateDoc(itemDoc(eventId, itemId), { ...toDoc(input), updatedAt: serverTimestamp() });
}

export async function deleteScheduleItem(eventId: string, itemId: string): Promise<void> {
  await deleteDoc(itemDoc(eventId, itemId));
}

/** Toggle whether an item appears in the master schedule (per-item override). */
export async function setScheduleItemMaster(
  eventId: string,
  itemId: string,
  includeInMaster: boolean,
): Promise<void> {
  await updateDoc(itemDoc(eventId, itemId), { includeInMaster, updatedAt: serverTimestamp() });
}

export interface ScheduleSyncResult {
  synced: boolean;
  reason?: string;
}

/**
 * Reconcile one item with the event's Google calendar (12b auto-push). Server-side: creates/
 * updates the event when it's in the master schedule with a time, else removes it. Returns
 * `{ synced:false, reason:'not_connected' }` (no-op) when the caller hasn't connected Google.
 */
export async function pushScheduleItem(eventId: string, itemId: string): Promise<ScheduleSyncResult> {
  const callable = httpsCallable<PushScheduleItemInput, PushScheduleItemOutput>(functions, 'pushScheduleItem');
  const res = await callable({ eventId, itemId });
  return res.data;
}

/** Remove a schedule item's calendar event (call before deleting the item). */
export async function removeScheduleCalendarEvent(eventId: string, calendarEventId: string): Promise<void> {
  const callable = httpsCallable<RemoveScheduleCalendarEventInput, RemoveScheduleCalendarEventOutput>(
    functions,
    'removeScheduleCalendarEvent',
  );
  await callable({ eventId, calendarEventId });
}
