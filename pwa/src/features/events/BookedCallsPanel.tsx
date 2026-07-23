/**
 * Booked calls panel (Phase 11b sync). Surfaces Google Appointment Schedule bookings that
 * couldn't be auto-matched to an advance, for one-click attach/dismiss, plus a manual
 * "Sync now". Confident matches are attached automatically (here and by the 2h cron), so
 * this list is just the ambiguous remainder. PM/admin only.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { formatZonedDateTime } from '@/lib/dates/timezone';
import { listEventAdvances } from '@/lib/tracker/tracker-service';
import type { LocatedAdvance } from '@/lib/tracker/tracker';
import {
  attachBooking,
  dismissBooking,
  listNeedsReviewBookings,
  syncEventBookings,
  useGoogleConnection,
  type CallBooking,
  type CallBookingReason,
} from '@/lib/google';

const logger = createLogger('BookedCalls');

const REASON_LABEL: Record<NonNullable<CallBookingReason>, string> = {
  no_match: 'No advance matches this artist name',
  multiple_matches: 'Several advances match — pick one',
  already_linked: 'The matching advance already has a call',
};

export function BookedCallsPanel({
  eventId,
  canEdit,
  timeZone,
}: {
  eventId: string;
  canEdit: boolean;
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const connection = useGoogleConnection();
  const isConnected = connection.data?.connected === true;

  const bookingsQuery = useQuery({
    queryKey: ['callBookings', eventId],
    queryFn: () => listNeedsReviewBookings(eventId),
    enabled: !!eventId,
  });
  const advancesQuery = useQuery({
    queryKey: ['eventAdvances', eventId],
    queryFn: () => listEventAdvances(eventId),
    enabled: !!eventId,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['callBookings', eventId] });
    void queryClient.invalidateQueries({ queryKey: ['eventAdvances', eventId] });
    void queryClient.invalidateQueries({ queryKey: ['advances'] });
  };

  const sync = useMutation({
    mutationFn: () => syncEventBookings(eventId),
    onSuccess: invalidate,
    onError: (e) => logger.error('Sync booked calls failed', e),
  });

  if (!canEdit) return null;

  const bookings = bookingsQuery.data ?? [];
  const advances = advancesQuery.data ?? [];

  return (
    <div className="space-y-3 border-t border-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-brand">Booked calls</h2>
        {isConnected ? (
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {sync.isPending ? 'Syncing…' : 'Sync now'}
          </button>
        ) : (
          <Link to="/settings" className="text-sm text-accent hover:underline">
            Connect Google to sync
          </Link>
        )}
      </div>

      <p className="text-sm text-ink-muted">
        Booked advance calls auto-attach to matching advances every couple of hours. Anything that
        can’t be matched confidently shows here for review.
      </p>

      {sync.data && (
        <p className="text-sm text-ink">
          Synced {sync.data.scanned} booking{sync.data.scanned === 1 ? '' : 's'} —{' '}
          <span className="text-status-complete">{sync.data.attached} auto-attached</span>,{' '}
          {sync.data.needsReview} need review.
        </p>
      )}
      {sync.isError && (
        <p className="text-sm text-accent">Couldn’t sync. Make sure Google is connected.</p>
      )}

      {bookingsQuery.isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing needs review.</p>
      ) : (
        <ul className="space-y-2">
          {bookings.map((b) => (
            <BookingRow
              key={b.id}
              booking={b}
              advances={advances}
              eventId={eventId}
              timeZone={timeZone}
              onResolved={invalidate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingRow({
  booking,
  advances,
  eventId,
  timeZone,
  onResolved,
}: {
  booking: CallBooking;
  advances: LocatedAdvance[];
  eventId: string;
  timeZone: string;
  onResolved: () => void;
}) {
  const [advanceId, setAdvanceId] = useState(booking.suggestedAdvanceId ?? '');

  const attach = useMutation({
    mutationFn: () => {
      const located = advances.find((a) => a.advance.id === advanceId);
      if (!located) throw new Error('Pick an advance to attach to.');
      return attachBooking({ eventId, stageId: located.stageId, advanceId, booking });
    },
    onSuccess: onResolved,
    onError: (e) => logger.error('Attach booking failed', e),
  });
  const dismiss = useMutation({
    mutationFn: () => dismissBooking(eventId, booking.calendarEventId),
    onSuccess: onResolved,
    onError: (e) => logger.error('Dismiss booking failed', e),
  });

  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-semibold text-ink">{booking.artistName}</span>
        <span className="text-sm text-ink-muted">
          {formatZonedDateTime(new Date(booking.startMillis), timeZone)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">
        {booking.festival && <span className="mr-2">{booking.festival}</span>}
        {booking.reason && <span>{REASON_LABEL[booking.reason]}</span>}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={advanceId}
          onChange={(e) => setAdvanceId(e.target.value)}
          className="rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
        >
          <option value="">Attach to advance…</option>
          {advances.map((a) => (
            <option key={a.advance.id} value={a.advance.id}>
              {a.advance.artistName} · {a.stageName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => attach.mutate()}
          disabled={!advanceId || attach.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {attach.isPending ? 'Attaching…' : 'Attach'}
        </button>
        {booking.meetLink && (
          <a
            href={booking.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:underline"
          >
            Open Meet
          </a>
        )}
        <button
          type="button"
          onClick={() => dismiss.mutate()}
          disabled={dismiss.isPending}
          className="ml-auto text-sm text-ink-muted hover:text-accent disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
      {attach.isError && (
        <p className="mt-1 text-xs text-accent">
          {attach.error instanceof Error ? attach.error.message : 'Could not attach.'}
        </p>
      )}
    </li>
  );
}
