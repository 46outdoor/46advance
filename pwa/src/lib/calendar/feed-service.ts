/**
 * Calendar subscription feed — client access (planning/archive/feature/CALENDAR_SUBSCRIPTIONS.md
 * Phase 1). The credential collections deny client reads, so everything flows through
 * callables. The feed URL embeds a bearer token and is returned ONLY by create/rotate —
 * the Settings card shows it once and it is not recoverable afterwards (rotation is
 * the recovery path).
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import type {
  CreateCalendarFeedOutput,
  GetCalendarFeedStatusOutput,
  RotateCalendarFeedOutput,
} from '@contracts/callables/calendarFeed';

export type CalendarFeedStatus = GetCalendarFeedStatusOutput;

/** React Query key for the caller's feed status. */
export function calendarFeedStatusKey(uid: string | undefined) {
  return ['calendarFeedStatus', uid ?? 'anon'] as const;
}

/** Non-secret feed state (never contains the URL). */
export async function getCalendarFeedStatus(): Promise<CalendarFeedStatus> {
  const callable = httpsCallable<Record<string, never>, GetCalendarFeedStatusOutput>(
    functions,
    'getCalendarFeedStatus',
  );
  return (await callable({})).data;
}

/** Mint the feed and return its URL — shown once. Fails if an active feed exists. */
export async function createCalendarFeed(): Promise<string> {
  const callable = httpsCallable<Record<string, never>, CreateCalendarFeedOutput>(
    functions,
    'createCalendarFeed',
  );
  return (await callable({})).data.url;
}

/** Revoke the current URL and mint a replacement — every subscriber must re-subscribe. */
export async function rotateCalendarFeed(): Promise<string> {
  const callable = httpsCallable<Record<string, never>, RotateCalendarFeedOutput>(
    functions,
    'rotateCalendarFeed',
  );
  return (await callable({})).data.url;
}

