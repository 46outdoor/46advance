/**
 * Callable contract schemas — calendar subscription feed credentials
 * (planning/CALENDAR_SUBSCRIPTIONS.md Phase 1). Pure Zod — see ./auth.ts header.
 *
 * The feed URL embeds a bearer token and is returned ONLY by create/rotate — status
 * never re-exposes it (the server stores just the SHA-256 digest).
 */
import { z } from 'zod';

// createCalendarFeed — mint the caller's subscription feed. Fails `already-exists`
// when an active feed exists (the client must rotate deliberately, past the warning).
export const createCalendarFeedInputSchema = z.object({});
export type CreateCalendarFeedInput = z.infer<typeof createCalendarFeedInputSchema>;
export const createCalendarFeedOutputSchema = z.object({
  /** Full feed URL — shown once; not recoverable later. */
  url: z.string(),
});
export type CreateCalendarFeedOutput = z.infer<typeof createCalendarFeedOutputSchema>;

// rotateCalendarFeed — revoke the active token (if any) and mint a fresh URL. The old
// URL stops working immediately; subscribers must re-subscribe with the new one.
export const rotateCalendarFeedInputSchema = z.object({});
export type RotateCalendarFeedInput = z.infer<typeof rotateCalendarFeedInputSchema>;
export const rotateCalendarFeedOutputSchema = z.object({ url: z.string() });
export type RotateCalendarFeedOutput = z.infer<typeof rotateCalendarFeedOutputSchema>;

// getCalendarFeedStatus — non-secret feed state for the Settings card (the token
// collections deny client reads, so status flows through this callable).
export const getCalendarFeedStatusInputSchema = z.object({});
export type GetCalendarFeedStatusInput = z.infer<typeof getCalendarFeedStatusInputSchema>;
export const getCalendarFeedStatusOutputSchema = z.object({
  /** An unrevoked token exists (revocation by admin action flips this off). */
  active: z.boolean(),
  /** Epoch millis; null when never created / not applicable. */
  createdAt: z.number().nullable(),
  rotatedAt: z.number().nullable(),
  /** Last feed fetch by any client (best-effort, stamped at most once per 24h) [1b]. */
  lastAccessedAt: z.number().nullable(),
});
export type GetCalendarFeedStatusOutput = z.infer<typeof getCalendarFeedStatusOutputSchema>;
