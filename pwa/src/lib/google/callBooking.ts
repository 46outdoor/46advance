/**
 * Booked advance-call model: `events/{eventId}/callBookings/{calendarEventId}` (Phase 11b sync).
 * Written server-side (functions/src/googleBookings.ts) from Google Appointment Schedule
 * bookings. `startMillis` is an absolute UTC instant; render it in Central via
 * `formatCentralDateTime`.
 */
import { z } from 'zod';
import type { DocumentData } from 'firebase/firestore';

export const CALL_BOOKING_STATUSES = ['needs_review', 'attached', 'dismissed'] as const;
export type CallBookingStatus = (typeof CALL_BOOKING_STATUSES)[number];

/** Why a booking needs review (null once attached). */
export type CallBookingReason = 'no_match' | 'multiple_matches' | 'already_linked' | null;

export interface CallBooking {
  id: string;
  calendarEventId: string;
  artistName: string;
  festival: string | null;
  startMillis: number;
  endMillis: number | null;
  meetLink: string | null;
  booker: string | null;
  status: CallBookingStatus;
  reason: CallBookingReason;
  suggestedAdvanceId: string | null;
  suggestedStageId: string | null;
  matchedAdvanceId: string | null;
  matchedStageId: string | null;
}

const schema = z.object({
  calendarEventId: z.string(),
  artistName: z.string(),
  festival: z.string().nullable().optional(),
  startMillis: z.number(),
  endMillis: z.number().nullable().optional(),
  meetLink: z.string().nullable().optional(),
  booker: z.string().nullable().optional(),
  status: z.enum(CALL_BOOKING_STATUSES),
  reason: z.enum(['no_match', 'multiple_matches', 'already_linked']).nullable().optional(),
  suggestedAdvanceId: z.string().nullable().optional(),
  suggestedStageId: z.string().nullable().optional(),
  matchedAdvanceId: z.string().nullable().optional(),
  matchedStageId: z.string().nullable().optional(),
});

export function parseCallBooking(id: string, data: DocumentData): CallBooking {
  const d = schema.parse(data);
  return {
    id,
    calendarEventId: d.calendarEventId,
    artistName: d.artistName,
    festival: d.festival ?? null,
    startMillis: d.startMillis,
    endMillis: d.endMillis ?? null,
    meetLink: d.meetLink ?? null,
    booker: d.booker ?? null,
    status: d.status,
    reason: d.reason ?? null,
    suggestedAdvanceId: d.suggestedAdvanceId ?? null,
    suggestedStageId: d.suggestedStageId ?? null,
    matchedAdvanceId: d.matchedAdvanceId ?? null,
    matchedStageId: d.matchedStageId ?? null,
  };
}
