/**
 * Per-event feed preferences (planning/archive/feature/CALENDAR_SUBSCRIPTIONS.md Phase 2): which of the
 * subscriber's events appear in their calendar feed, and per event whether the day shows
 * as one all-day digest (the default) or as individual timed items.
 *
 * Saves are optimistic per toggle — each change is an independent partial update, so a
 * failure rolls back only that row. Preferences take effect on the calendar app's next
 * refresh, which for Google can be hours (stated on the parent card).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { describeCallableError } from '@/lib/errors/callableError';
import { listEvents } from '@/lib/events/events-read';
import { formatZonedDateRange } from '@/lib/dates/timezone';
import {
  calendarSubscriptionKey,
  getCalendarSubscription,
  toggleId,
  updateCalendarSubscription,
  type CalendarSubscription,
} from '@/lib/calendar/subscription-service';
import type { UpdateCalendarSubscriptionInput } from '@contracts/callables/calendarFeed';

const logger = createLogger('CalendarFeedPicker');

export function CalendarFeedEventPicker() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prefsKey = calendarSubscriptionKey(user?.uid);

  const prefsQuery = useQuery({
    queryKey: prefsKey,
    queryFn: getCalendarSubscription,
    enabled: user != null,
  });
  // The feed carries the events the user is a MEMBER of, so always list memberships —
  // never a cross-event view, which would offer events their feed won't contain.
  // `isAdmin`/`isProductionDirector` are pinned false ON PURPOSE: both widen `listEvents` to
  // every event, and a production director would otherwise be shown the entire application's
  // event list here and could subscribe their personal calendar to shows they merely oversee.
  // Do not "fix" this by passing the real viewer.
  const eventsQuery = useQuery({
    queryKey: ['calendarFeedEvents', user?.uid],
    queryFn: () =>
      listEvents({
        uid: user?.uid ?? '',
        isAdmin: false,
        isOrganizer: false,
        isProductionDirector: false,
      }),
    enabled: user != null,
  });

  const save = useMutation({
    mutationFn: (input: UpdateCalendarSubscriptionInput) => updateCalendarSubscription(input),
    onSuccess: (next) => queryClient.setQueryData(prefsKey, next),
    onError: (e) => {
      logger.error('Failed to save calendar feed preferences', e);
      void queryClient.invalidateQueries({ queryKey: prefsKey });
    },
  });

  const prefs: CalendarSubscription = prefsQuery.data ?? {
    itemModeEventIds: [],
    excludedEventIds: [],
    hidePastEvents: false,
  };
  const events = eventsQuery.data ?? [];
  const excluded = new Set(prefs.excludedEventIds);
  const itemMode = new Set(prefs.itemModeEventIds);
  const busy = save.isPending;

  if (prefsQuery.isLoading || eventsQuery.isLoading) {
    return <p className="text-sm text-ink-muted">Loading your events…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h4 className="font-medium text-ink">What&rsquo;s in your feed</h4>
        <p className="text-sm text-ink-muted">
          Every event you&rsquo;re on is included by default. Turn one off to drop it, or switch it
          to individual items to get every scheduled row as its own timed event instead of one
          all-day summary.
        </p>
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={prefs.hidePastEvents}
          disabled={busy}
          onChange={(e) => save.mutate({ hidePastEvents: e.currentTarget.checked })}
          className="size-4 accent-accent"
        />
        Hide events that have already finished
      </label>

      {events.length === 0 ? (
        <p className="text-sm text-ink-muted">
          You&rsquo;re not on any events yet — they&rsquo;ll appear here automatically.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded border border-line">
          {events.map((event) => {
            const included = !excluded.has(event.id);
            const asItems = itemMode.has(event.id);
            return (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <label className="flex min-h-11 flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={included}
                    disabled={busy}
                    onChange={(e) =>
                      save.mutate({
                        excludedEventIds: toggleId(
                          prefs.excludedEventIds,
                          event.id,
                          !e.currentTarget.checked,
                        ),
                      })
                    }
                    className="size-4 accent-accent"
                  />
                  <span className={included ? 'text-ink' : 'text-ink-muted line-through'}>
                    {event.shortCode ? `${event.shortCode} — ` : ''}
                    {event.name}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {formatZonedDateRange(event.startDate, event.endDate, event.timeZone)}
                  </span>
                </label>
                <button
                  type="button"
                  disabled={busy || !included}
                  onClick={() =>
                    save.mutate({
                      itemModeEventIds: toggleId(prefs.itemModeEventIds, event.id, !asItems),
                    })
                  }
                  className="min-h-11 rounded border border-line px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                  aria-pressed={asItems}
                >
                  {asItems ? 'Individual items' : 'Daily summary'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {save.isError && <p className="text-sm text-accent">{describeCallableError(save.error)}</p>}
    </div>
  );
}
