/**
 * Advance call panel (ROADMAP §12). Read-only view of the scheduled call: time, a Join
 * link, and an offline "Add to calendar" (.ics, 11a).
 *
 * Advance calls are created OUTSIDE the app: a Google Appointment Schedule booking page is
 * shared with artists, the artist picks a slot, and Google creates the meeting, mints the
 * Meet link, and puts it on the invitees' calendars. The app's job is to TRACK them —
 * `syncAdvanceCallBookings` / `scheduledAdvanceCallSync` match bookings to advances and
 * write the time/link back. The app-created Meet path was retired in Phase 3 of
 * planning/CALENDAR_SUBSCRIPTIONS.md; an existing link can still be set by editing the
 * advance.
 */
import { downloadIcs } from '@/lib/calendar/ics';
import { formatZonedDateTime } from '@/lib/dates/timezone';

/** Fallback length for the downloadable .ics when the booking carries no duration. */
const DEFAULT_CALL_MINUTES = 30;

interface Props {
  artistName: string;
  at: Date | null;
  link: string | null;
  /** True when the call is linked to a Google calendar event — i.e. it came from a
   * booked Appointment Schedule slot rather than being typed in by hand. */
  viaGoogle: boolean;
  /** The event's timezone — the call time is shown in it, not the browser's (F-6). */
  timeZone: string;
  canEdit: boolean;
}

export function AdvanceCallPanel({ artistName, at, link, viaGoogle, timeZone, canEdit }: Props) {
  const title = `Advance call — ${artistName}`;
  const hasCall = Boolean(at || link);
  if (!hasCall && !canEdit) return null;

  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-brand">Advance call</h2>
        {viaGoogle && (
          <span className="rounded-full bg-status-complete/15 px-2 py-0.5 text-[0.65rem] font-semibold text-status-complete">
            Booked via Google
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
                  durationMinutes: DEFAULT_CALL_MINUTES,
                  url: link,
                })
              }
              className="min-h-11 text-accent hover:underline"
            >
              Add to calendar
            </button>
          )}
        </div>
      ) : (
        <p className="mt-1 text-sm text-ink-muted">No advance call scheduled yet.</p>
      )}

      {canEdit && !hasCall && (
        <p className="mt-3 border-t border-line/60 pt-3 text-xs text-ink-muted">
          Advance calls are booked through the artist&rsquo;s Appointment Schedule page — Google
          creates the meeting and sends the invite. Booked slots appear here automatically once they
          sync. You can also set a time and link by editing the advance.
        </p>
      )}
    </div>
  );
}
