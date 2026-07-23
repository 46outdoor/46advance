/**
 * Callable contract schemas — events domain (createEventFromTemplate).
 * Wire shape: dates are epoch millis (the client converts Date→millis; the server
 * converts millis→Timestamp after parsing). Pure Zod — see ./auth.ts header.
 */
import { z } from 'zod';

export const createEventFromTemplateInputSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().trim().min(1),
  startDate: z.number().nullable(),
  endDate: z.number().nullable(),
  loadInDays: z.number().int().min(0).optional(),
  loadOutDays: z.number().int().min(0).optional(),
  timeZone: z.string().optional(),
  venue: z.string().nullable(),
  shortCode: z.string().nullable().optional(),
  slug: z.string().nullable(),
});
export type CreateEventFromTemplateInput = z.infer<typeof createEventFromTemplateInputSchema>;

export const createEventFromTemplateOutputSchema = z.object({
  eventId: z.string().min(1),
});
export type CreateEventFromTemplateOutput = z.infer<typeof createEventFromTemplateOutputSchema>;

// createBlankEvent — atomically create a blank event + the creator's PM membership. The
// client supplies `eventId`, which doubles as an idempotency key (retrying returns the
// same event instead of duplicating). Dates are epoch millis.
export const createBlankEventInputSchema = z.object({
  eventId: z.string().min(1).max(128),
  name: z.string().trim().min(1),
  startDate: z.number().nullable(),
  endDate: z.number().nullable(),
  loadInDays: z.number().int().min(0).optional(),
  loadOutDays: z.number().int().min(0).optional(),
  timeZone: z.string().optional(),
  venue: z.string().nullable(),
  shortCode: z.string().nullable().optional(),
  driveFolderId: z.string().nullable().optional(),
  driveFolderName: z.string().nullable().optional(),
  departmentIds: z.array(z.string()).optional(),
  bookingLabel: z.string().nullable().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  slug: z.string().nullable(),
});
export type CreateBlankEventInput = z.infer<typeof createBlankEventInputSchema>;

export const createBlankEventOutputSchema = z.object({ eventId: z.string().min(1) });
export type CreateBlankEventOutput = z.infer<typeof createBlankEventOutputSchema>;

// renameEventSlug — transactionally move an event's slug reservation (WS-G): reserve the new
// `slugs/{slug}`, release the old, and update `events/{id}.slug` in one commit. `slug` is the
// desired (pre-slugified) value; the server re-slugifies and de-duplicates, so the returned
// slug may differ (a `-2` suffix on collision). Idempotent when it already resolves to the
// event's current slug.
export const renameEventSlugInputSchema = z.object({
  eventId: z.string().min(1),
  slug: z.string().min(1),
});
export type RenameEventSlugInput = z.infer<typeof renameEventSlugInputSchema>;

export const renameEventSlugOutputSchema = z.object({ slug: z.string().min(1) });
export type RenameEventSlugOutput = z.infer<typeof renameEventSlugOutputSchema>;
