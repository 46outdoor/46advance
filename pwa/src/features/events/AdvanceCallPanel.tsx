/**
 * Advance call panel (ROADMAP §12). Shows the scheduled call: time, a Join link, and an
 * offline "Add to calendar" (.ics, 11a). For editors (PM/admin), when their Google account
 * is connected (11b), schedules a call by creating a Google Calendar event + Meet link on
 * the event's calendar (server-side), writing the link back to the advance. Not connected
 * → a prompt to connect; an existing link can still be added by editing the advance.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { downloadIcs } from '@/lib/calendar/ics';
import { dateToZonedInput, zonedInputToDate, formatZonedDateTime } from '@/lib/dates/timezone';
import { createAdvanceCall, useGoogleConnection } from '@/lib/google';

const logger = createLogger('AdvanceCall');

interface Props {
  eventId: string;
  stageId: string;
  advanceId: string;
  artistName: string;
  at: Date | null;
  link: string | null;
  /** True when the call was created via Google (has a calendar event). */
  viaGoogle: boolean;
  /** The event's timezone — the call time is entered/shown in it, not the browser's (F-6). */
  timeZone: string;
  canEdit: boolean;
  onCreated: () => void;
}

export function AdvanceCallPanel({
  eventId,
  stageId,
  advanceId,
  artistName,
  at,
  link,
  viaGoogle,
  timeZone,
  canEdit,
  onCreated,
}: Props) {
  const connection = useGoogleConnection();
  const isConnected = connection.data?.connected === true;
  // The datetime-local value is wall-clock interpreted in the EVENT's zone (not the browser's).
  const [when, setWhen] = useState(() => dateToZonedInput(at, timeZone));
  const [duration, setDuration] = useState(30);

  const create = useMutation({
    mutationFn: () => {
      const start = zonedInputToDate(when, timeZone);
      if (!start) throw new Error('Pick a date and time first.');
      return createAdvanceCall({
        eventId,
        stageId,
        advanceId,
        startMillis: start.getTime(),
        durationMinutes: duration,
      });
    },
    onSuccess: () => onCreated(),
    onError: (e) => logger.error('Failed to create Google Meet advance call', e),
  });

  const title = `Advance call — ${artistName}`;
  const hasCall = Boolean(at || link);
  if (!hasCall && !canEdit) return null;

  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-brand">Advance call</h2>
        {viaGoogle && (
          <span className="rounded-full bg-status-complete/15 px-2 py-0.5 text-[0.65rem] font-semibold text-status-complete">
            Google Meet
          </span>
        )}
      </div>

      {hasCall ? (
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
          {at && <span className="text-ink-muted">{formatZonedDateTime(at, timeZone)}</span>}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Join
            </a>
          )}
          {at && (
            <button
              type="button"
              onClick={() =>
                downloadIcs({
                  uid: `${title}-${at.getTime()}@46advance`,
                  title,
                  start: at,
                  durationMinutes: duration,
                  url: link,
                })
              }
              className="text-accent hover:underline"
            >
              Add to calendar
            </button>
          )}
        </div>
      ) : (
        <p className="mt-1 text-sm text-ink-muted">No advance call scheduled yet.</p>
      )}

      {canEdit && (
        <div className="mt-3 border-t border-line/60 pt-3">
          {isConnected ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-ink-muted">
                Call time (Central)
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="mt-0.5 block rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
                />
              </label>
              <label className="text-xs text-ink-muted">
                Minutes
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) || 30)}
                  className="mt-0.5 block w-20 rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
                />
              </label>
              <button
                type="button"
                disabled={!when || create.isPending}
                onClick={() => create.mutate()}
                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {create.isPending
                  ? 'Creating…'
                  : hasCall
                    ? 'New Google Meet'
                    : 'Create Google Meet'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-ink-muted">
              <Link to="/settings" className="text-accent hover:underline">
                Connect Google
              </Link>{' '}
              to create a Meet link for this call. You can still add an existing link by editing the
              advance.
            </p>
          )}
          {create.isError && (
            <p className="mt-1 text-xs text-accent">
              {create.error instanceof Error
                ? create.error.message
                : 'Could not create the Meet link.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
