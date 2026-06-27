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

// generatePacket → a Storage path; the client resolves a member-gated download URL.
export const pdfPathOutputSchema = z.object({
  path: z.string().min(1),
});
export type PdfPathOutput = z.infer<typeof pdfPathOutputSchema>;

// generateQuotePdf → a signed, expiring (7-day) URL for sharing with the artist.
// `url`/`expiresAt` are absent only when the signing IAM isn't configured, in which
// case the client falls back to a member-gated download of `path`.
export const generateQuotePdfOutputSchema = z.object({
  path: z.string().min(1),
  url: z.string().min(1).optional(),
  expiresAt: z.number().optional(),
});
export type GenerateQuotePdfOutput = z.infer<typeof generateQuotePdfOutputSchema>;
