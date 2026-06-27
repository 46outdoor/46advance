/**
 * Callable contract schemas — Google Calendar/Meet domain (googleAuthUrl,
 * googleDisconnect, createEventCalendar, createAdvanceCall, syncAdvanceCallBookings).
 * Pure Zod — see ./auth.ts header. (The googleAuthCallback OAuth redirect is an
 * onRequest HTTP endpoint, not a callable, so it has no contract here.)
 */
import { z } from 'zod';

// googleAuthUrl — no input; returns the OAuth consent URL.
export const googleAuthUrlOutputSchema = z.object({ url: z.string().min(1) });
export type GoogleAuthUrlOutput = z.infer<typeof googleAuthUrlOutputSchema>;

// googleDisconnect — no input.
export const googleDisconnectOutputSchema = z.object({ ok: z.boolean() });
export type GoogleDisconnectOutput = z.infer<typeof googleDisconnectOutputSchema>;

// createEventCalendar — server-only today (no client caller yet).
export const createEventCalendarInputSchema = z.object({ eventId: z.string().min(1) });
export type CreateEventCalendarInput = z.infer<typeof createEventCalendarInputSchema>;
export const createEventCalendarOutputSchema = z.object({ calendarId: z.string().min(1) });
export type CreateEventCalendarOutput = z.infer<typeof createEventCalendarOutputSchema>;

// createAdvanceCall — startMillis is an epoch-ms instant; duration defaults server-side.
export const createAdvanceCallInputSchema = z.object({
  eventId: z.string().min(1),
  stageId: z.string().min(1),
  advanceId: z.string().min(1),
  startMillis: z.number(),
  durationMinutes: z.number().optional(),
});
export type CreateAdvanceCallInput = z.infer<typeof createAdvanceCallInputSchema>;
export const createAdvanceCallOutputSchema = z.object({
  link: z.string().nullable(),
  calendarId: z.string(),
  calendarEventId: z.string().nullable(),
});
export type CreateAdvanceCallOutput = z.infer<typeof createAdvanceCallOutputSchema>;

// syncAdvanceCallBookings — manual "sync now" for one event.
export const syncAdvanceCallBookingsInputSchema = z.object({ eventId: z.string().min(1) });
export type SyncAdvanceCallBookingsInput = z.infer<typeof syncAdvanceCallBookingsInputSchema>;
export const syncAdvanceCallBookingsOutputSchema = z.object({
  scanned: z.number(),
  attached: z.number(),
  needsReview: z.number(),
});
export type SyncAdvanceCallBookingsOutput = z.infer<typeof syncAdvanceCallBookingsOutputSchema>;
