/**
 * Booked advance-call data access (Phase 11b sync). Sync runs server-side (reads the user's
 * Google Calendar); the review queue + attach/dismiss are Firestore reads/writes gated by
 * firestore.rules (member read; PM/admin write — same gate as advances).
 */
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/services/firebase';
import { parseCallBooking, type CallBooking } from './callBooking';
import type {
  AttachCallBookingInput,
  AttachCallBookingOutput,
  SyncAdvanceCallBookingsInput,
  SyncAdvanceCallBookingsOutput,
} from '@contracts/callables/google';

export interface SyncResult {
  scanned: number;
  attached: number;
  needsReview: number;
}

/** Trigger an immediate sync of booked calls for an event (reads the caller's calendar). */
export async function syncEventBookings(eventId: string): Promise<SyncResult> {
  const callable = httpsCallable<SyncAdvanceCallBookingsInput, SyncAdvanceCallBookingsOutput>(
    functions,
    'syncAdvanceCallBookings',
  );
  const res = await callable({ eventId });
  return res.data;
}

/** Bookings awaiting manual resolution for an event, soonest first. */
export async function listNeedsReviewBookings(eventId: string): Promise<CallBooking[]> {
  const snap = await getDocs(
    query(collection(db, 'events', eventId, 'callBookings'), where('status', '==', 'needs_review')),
  );
  return snap.docs
    .map((d) => parseCallBooking(d.id, d.data()))
    .sort((a, b) => a.startMillis - b.startMillis);
}

/**
 * Attach a booking to an advance ATOMICALLY via the server (WS-G). Replaces the old two client
 * `updateDoc`s, which stomped the advance with no read-back (clobbering a concurrent cron attach)
 * and could half-write. The callable re-reads the booking for the call time + Meet link, claims
 * the advance + flips the booking in one transaction, and returns any booking it displaced back
 * to the review queue.
 */
export async function attachBooking(args: {
  eventId: string;
  stageId: string;
  advanceId: string;
  booking: CallBooking;
}): Promise<AttachCallBookingOutput> {
  const { eventId, stageId, advanceId, booking } = args;
  const callable = httpsCallable<AttachCallBookingInput, AttachCallBookingOutput>(functions, 'attachCallBooking');
  const res = await callable({ eventId, stageId, advanceId, bookingId: booking.calendarEventId });
  return res.data;
}

/** Dismiss a booking from the review queue (won't reappear on future syncs). */
export async function dismissBooking(eventId: string, bookingId: string): Promise<void> {
  await updateDoc(doc(db, 'events', eventId, 'callBookings', bookingId), {
    status: 'dismissed',
    updatedAt: serverTimestamp(),
  });
}
