/**
 * Callable contract schemas — PDF domain (generatePacket, generateQuotePdf).
 * Both return a Storage `{ path }` the client resolves to a member-gated download
 * URL. Pure Zod — see ./auth.ts header.
 */
import { z } from 'zod';

export const generatePacketInputSchema = z.object({
  eventId: z.string().min(1),
});
export type GeneratePacketInput = z.infer<typeof generatePacketInputSchema>;

export const generateQuotePdfInputSchema = z.object({
  eventId: z.string().min(1),
  stageId: z.string().min(1),
  advanceId: z.string().min(1),
  quoteId: z.string().min(1),
});
export type GenerateQuotePdfInput = z.infer<typeof generateQuotePdfInputSchema>;

// Shared output for both PDF callables: a Storage path.
export const pdfPathOutputSchema = z.object({
  path: z.string().min(1),
});
export type PdfPathOutput = z.infer<typeof pdfPathOutputSchema>;
