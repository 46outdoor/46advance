/**
 * Callable contract schemas — PDF domain (generatePacket, generateQuotePdf).
 * Both return a Storage `{ path }` the client resolves to a member-gated download
 * URL. Pure Zod — see ./auth.ts header.
 */
import { z } from 'zod';

export const generatePacketInputSchema = z.object({
  eventId: z.string().min(1),
  /** 1-based packet version for the cover + `{version}` filename token; defaults to the event's
   *  current version (or 1). The save flow passes the chosen replace/bump version.
   *  `.nullish()`, not `.optional()`: the callable client encodes an explicitly-`undefined`
   *  property as `null` (see the auth.ts header), and `.optional()` rejects null with a 400.
   *  The handler reads it as `version ?? currentVersion`, so null and undefined behave alike. */
  version: z.number().int().min(1).nullish(),
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
  /**
   * Non-fatal problems the render worked around — surfaced so a silently-degraded packet doesn't
   * look identical to a correct one. Today: a logo variant that couldn't be embedded (the PDF
   * renderer takes PNG/JPEG only, so a WebP saved as `.png` decodes to nothing), where the render
   * falls back to the other variant or drops the mark. Absent/empty means a clean render.
   */
  warnings: z.array(z.string()).optional(),
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
