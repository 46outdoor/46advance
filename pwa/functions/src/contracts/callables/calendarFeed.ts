/**
 * Callable contract schemas — calendar subscription feed credentials
 * (planning/archive/feature/CALENDAR_SUBSCRIPTIONS.md Phase 1). Pure Zod — see ./auth.ts header.
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

// updateCalendarSubscription — the per-user feed preferences (Phase 2). Exact field
// allowlist, bounded arrays of bounded ids, deduplicated; `updatedAt` is server-owned.
// Membership stays the confidentiality gate — listing an event id you are not a member
// of never grants access — while these bounds keep malformed/oversized preferences from
// becoming an availability problem.
const MAX_EVENT_IDS = 250;
const eventIdList = z
  .array(z.string().trim().min(1).max(128))
  .max(MAX_EVENT_IDS)
  .transform((ids) => [...new Set(ids)]);

export const updateCalendarSubscriptionInputSchema = z
  .object({
    /** Events rendered as individual timed items instead of the default digest. */
    itemModeEventIds: eventIdList.optional(),
    /** Events opted out of entirely. Wins over itemMode if an id appears in both. */
    excludedEventIds: eventIdList.optional(),
    /** Drop events whose last schedule day is past. Default false — history persists. */
    hidePastEvents: z.boolean().optional(),
  })
  .strict();
export type UpdateCalendarSubscriptionInput = z.infer<typeof updateCalendarSubscriptionInputSchema>;

export const calendarSubscriptionSchema = z.object({
  itemModeEventIds: z.array(z.string()),
  excludedEventIds: z.array(z.string()),
  hidePastEvents: z.boolean(),
});
export type CalendarSubscription = z.infer<typeof calendarSubscriptionSchema>;

export const getCalendarSubscriptionInputSchema = z.object({});
export type GetCalendarSubscriptionInput = z.infer<typeof getCalendarSubscriptionInputSchema>;

/** Defaults for a user with no preferences doc: all events, digest, keep history. */
export const CALENDAR_SUBSCRIPTION_DEFAULTS: CalendarSubscription = {
  itemModeEventIds: [],
  excludedEventIds: [],
  hidePastEvents: false,
};
