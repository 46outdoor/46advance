import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDateRange } from '@/lib/dates/formatting';
import { getEventTracker } from '@/lib/tracker/tracker-service';
import { CompletionBar } from './CompletionBar';
import { TrackerGrid } from './TrackerGrid';

/** Per-event tracker grid: advances × departments, status-colored. */
export function EventTrackerScreen() {
  const { eventId } = useParams();

  const query = useQuery({
    queryKey: ['tracker', 'event', eventId],
    queryFn: () => getEventTracker(eventId!),
    enabled: !!eventId,
  });

  if (!eventId) return null;

  const view = query.data;

  return (
    <section className="space-y-6">
      <Link to="/tracker" className="text-sm text-ink-muted hover:text-accent">
        ← Tracker
      </Link>

      {query.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {query.isError && <p className="text-sm text-accent">Failed to load this tracker.</p>}
      {query.data === null && <p className="text-sm text-ink-muted">Event not found, or you don’t have access.</p>}

      {view && (
        <>
          <header className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl font-black tracking-tight text-brand">{view.event.name}</h1>
                <p className="text-ink-muted">{formatDateRange(view.event.startDate, view.event.endDate)}</p>
              </div>
              <Link
                to={`/events/${eventId}`}
                className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
              >
                Open event
              </Link>
            </div>
            <div className="max-w-sm">
              <CompletionBar counts={view.tracker.summary} />
            </div>
          </header>

          <TrackerGrid eventId={eventId} tracker={view.tracker} />
        </>
      )}
    </section>
  );
}
