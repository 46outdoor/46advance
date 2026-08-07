/**
 * Settings card for the personal calendar subscription feed
 * (planning/CALENDAR_SUBSCRIPTIONS.md Phase 1). Creates/rotates the per-user feed URL
 * (a bearer credential — displayed exactly once per mint), links Apple/Google
 * subscription instructions, and states the Google refresh-latency caveat plainly.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { describeCallableError } from '@/lib/errors/callableError';
import { formatCentralDate, formatCentralDateTime } from '@/lib/dates/timezone';
import {
  calendarFeedStatusKey,
  createCalendarFeed,
  getCalendarFeedStatus,
  rotateCalendarFeed,
} from '@/lib/calendar/feed-service';

const logger = createLogger('CalendarFeed');

function MintedUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch (e) {
      logger.error('Copy to clipboard failed', e);
    }
  };
  return (
    <div className="space-y-3 rounded border border-line bg-surface-muted p-3">
      <p className="text-sm font-medium text-ink">
        Your subscription URL — copy it now. For security it is shown only this once; if you lose
        it, rotate to get a new one.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-11 min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1.5 font-mono text-xs text-ink"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-11 rounded bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="space-y-1 text-sm text-ink-muted">
        <p>
          <span className="font-medium text-ink">Apple Calendar:</span> File → New Calendar
          Subscription on a Mac, or Settings → Apps → Calendar → Accounts → Add Subscribed Calendar
          on iPhone — then paste the URL.
        </p>
        <p>
          <span className="font-medium text-ink">Google Calendar:</span> Other calendars → “+” →
          From URL, then paste the URL.
        </p>
        <p>
          Google Calendar refreshes subscribed feeds on its own schedule — often many hours. Don’t
          rely on it for show-day changes; Apple Calendar lets you choose the refresh interval.
        </p>
      </div>
    </div>
  );
}

export function CalendarFeedCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mintedUrl, setMintedUrl] = useState<string | null>(null);
  const [confirmingRotate, setConfirmingRotate] = useState(false);

  const statusQuery = useQuery({
    queryKey: calendarFeedStatusKey(user?.uid),
    queryFn: getCalendarFeedStatus,
    enabled: user != null,
  });

  const onMinted = (url: string) => {
    setMintedUrl(url);
    setConfirmingRotate(false);
    void queryClient.invalidateQueries({ queryKey: calendarFeedStatusKey(user?.uid) });
  };
  const create = useMutation({
    mutationFn: createCalendarFeed,
    onSuccess: onMinted,
    onError: (e) => logger.error('Failed to create the calendar feed', e),
  });
  const rotate = useMutation({
    mutationFn: rotateCalendarFeed,
    onSuccess: onMinted,
    onError: (e) => logger.error('Failed to rotate the calendar feed', e),
  });

  const status = statusQuery.data;
  const active = status?.active === true;
  const mutationError = create.error ?? rotate.error;

  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-display text-lg font-bold text-brand">Calendar subscription</h3>
          <p className="max-w-prose text-sm text-ink-muted">
            One personal “46 Advance” calendar with every event you’re on. Each schedule day shows
            as an all-day summary of the day’s times, items, and stages. New events appear
            automatically; events you leave disappear.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            active
              ? 'bg-status-complete/15 text-status-complete'
              : 'bg-surface-muted text-ink-muted'
          }`}
        >
          {statusQuery.isLoading ? 'Checking…' : active ? 'Active' : 'Not set up'}
        </span>
      </div>

      <div className="mt-3 space-y-3 text-sm">
        {mintedUrl ? (
          <MintedUrl url={mintedUrl} />
        ) : active ? (
          <p className="text-ink-muted">
            Your feed is active
            {status?.rotatedAt
              ? ` (last rotated ${formatCentralDate(new Date(status.rotatedAt))})`
              : status?.createdAt
                ? ` (created ${formatCentralDate(new Date(status.createdAt))})`
                : ''}
            . The URL is shown only when it’s created — rotate to get a new one.{' '}
            {status?.lastAccessedAt
              ? `Feed last fetched ${formatCentralDateTime(new Date(status.lastAccessedAt))} (recorded at most once a day, so newer polls may not show yet).`
              : 'No fetches recorded yet — check your subscription if this persists.'}
          </p>
        ) : (
          !statusQuery.isLoading && (
            <p className="text-ink-muted">
              Create your subscription URL, then add it to Apple or Google Calendar. Anyone with the
              URL can read your schedule feed, so treat it like a password.
            </p>
          )
        )}

        {!statusQuery.isLoading &&
          (active || status?.createdAt ? (
            confirmingRotate ? (
              <div className="space-y-2 rounded border border-line bg-surface-muted p-3">
                <p className="text-ink">
                  Rotating stops the current URL from updating immediately. Every calendar app
                  subscribed to it goes stale until you subscribe it to the new URL.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => rotate.mutate()}
                    disabled={rotate.isPending}
                    className="min-h-11 rounded bg-accent px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {rotate.isPending ? 'Rotating…' : 'Rotate now'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRotate(false)}
                    className="min-h-11 rounded border border-line px-3 py-1.5 transition-colors hover:border-accent hover:text-accent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRotate(true)}
                className="min-h-11 rounded border border-line px-3 py-1.5 transition-colors hover:border-accent hover:text-accent"
              >
                Rotate URL…
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="min-h-11 rounded bg-accent px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {create.isPending ? 'Creating…' : 'Create subscription URL'}
            </button>
          ))}

        {mutationError != null && (
          <p className="text-accent">{describeCallableError(mutationError)}</p>
        )}
      </div>
    </div>
  );
}
