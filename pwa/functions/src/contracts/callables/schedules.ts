/**
 * Callable contract schemas — schedule-sync domain (pushScheduleItem,
 * removeScheduleCalendarEvent). Pure Zod — see ./auth.ts header.
 */
import { z } from 'zod';

// pushScheduleItem — reconcile one item with the event's Google calendar.
export const pushScheduleItemInputSchema = z.object({
  eventId: z.string().min(1),
  itemId: z.string().min(1),
});
export type PushScheduleItemInput = z.infer<typeof pushScheduleItemInputSchema>;
export const pushScheduleItemOutputSchema = z.object({
  synced: z.boolean(),
  reason: z.string().optional(), // e.g. 'not_connected'
  removed: z.boolean().optional(),
  calendarEventId: z.string().nullable().optional(),
});
export type PushScheduleItemOutput = z.infer<typeof pushScheduleItemOutputSchema>;

// removeScheduleCalendarEvent — drop an item's calendar event before deletion.
export const removeScheduleCalendarEventInputSchema = z.object({
  eventId: z.string().min(1),
  calendarEventId: z.string().min(1),
});
export type RemoveScheduleCalendarEventInput = z.infer<typeof removeScheduleCalendarEventInputSchema>;
export const removeScheduleCalendarEventOutputSchema = z.object({
  removed: z.boolean(),
  reason: z.string().optional(),
});
export type RemoveScheduleCalendarEventOutput = z.infer<typeof removeScheduleCalendarEventOutputSchema>;
