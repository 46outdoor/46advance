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
  venue: z.string().nullable(),
  slug: z.string().nullable(),
});
export type CreateEventFromTemplateInput = z.infer<typeof createEventFromTemplateInputSchema>;

export const createEventFromTemplateOutputSchema = z.object({
  eventId: z.string().min(1),
});
export type CreateEventFromTemplateOutput = z.infer<typeof createEventFromTemplateOutputSchema>;
