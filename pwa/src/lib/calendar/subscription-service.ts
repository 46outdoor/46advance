/**
 * Calendar feed preferences — client access (planning/CALENDAR_SUBSCRIPTIONS.md Phase 2).
 * Reads go through the callable rather than Firestore so the defaults for a missing doc
 * live in exactly one place (the server); writes must, since rules deny client writes.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import type {
  CalendarSubscription,
  UpdateCalendarSubscriptionInput,
} from '@contracts/callables/calendarFeed';

export type { CalendarSubscription };

/** React Query key for the caller's feed preferences. */
export function calendarSubscriptionKey(uid: string | undefined) {
  return ['calendarSubscription', uid ?? 'anon'] as const;
}

export async function getCalendarSubscription(): Promise<CalendarSubscription> {
  const callable = httpsCallable<Record<string, never>, CalendarSubscription>(
    functions,
    'getCalendarSubscription',
  );
  return (await callable({})).data;
}

/** Partial update — omitted fields keep their stored value. Returns the merged result. */
export async function updateCalendarSubscription(
  input: UpdateCalendarSubscriptionInput,
): Promise<CalendarSubscription> {
  const callable = httpsCallable<UpdateCalendarSubscriptionInput, CalendarSubscription>(
    functions,
    'updateCalendarSubscription',
  );
  return (await callable(input)).data;
}

/** Toggle membership of `id` in `list` (pure helper for the picker's toggles). */
export function toggleId(list: readonly string[], id: string, on: boolean): string[] {
  const set = new Set(list);
  if (on) set.add(id);
  else set.delete(id);
  return [...set];
}
