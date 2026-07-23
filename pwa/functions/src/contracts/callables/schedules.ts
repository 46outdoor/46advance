/**
 * Callable contract schemas — schedule-sync domain (reconcileScheduleDay,
 * removeScheduleCalendarEvent). Pure Zod — see ./auth.ts header.
 */
import { z } from 'zod';

// reconcileScheduleDay — reconcile every item of one schedule day with the event's
// Google calendar (redesign PR 4): pushToCalendar items with a start time get their
// calendar events created/updated (instants derived from the day's date + wall-clock
// times in the event's timezone, {artist N} placeholders resolved); others get any
// existing event removed. Per-item calendar ids write back transactionally.
export const reconcileScheduleDayInputSchema = z.object({
  eventId: z.string().min(1),
  dayId: z.string().min(1),
});
export type ReconcileScheduleDayInput = z.infer<typeof reconcileScheduleDayInputSchema>;
export const reconcileScheduleDayOutputSchema = z.object({
  synced: z.boolean(),
  reason: z.string().optional(), // e.g. 'not_connected'
  /** Items whose calendar state changed (created/updated/removed). */
  updated: z.number().optional(),
});
export type ReconcileScheduleDayOutput = z.infer<typeof reconcileScheduleDayOutputSchema>;

// removeScheduleCalendarEvent — drop an item's calendar event before deleting the item
// (or its whole day), since the stored id is gone afterwards.
export const removeScheduleCalendarEventInputSchema = z.object({
  eventId: z.string().min(1),
  calendarEventId: z.string().min(1),
});
export type RemoveScheduleCalendarEventInput = z.infer<
  typeof removeScheduleCalendarEventInputSchema
>;
export const removeScheduleCalendarEventOutputSchema = z.object({
  removed: z.boolean(),
  reason: z.string().optional(),
});
export type RemoveScheduleCalendarEventOutput = z.infer<
  typeof removeScheduleCalendarEventOutputSchema
>;
