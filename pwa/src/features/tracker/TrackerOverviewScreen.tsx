import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { formatDateRange } from '@/lib/dates/formatting';
import { listEventTrackerSummaries } from '@/lib/tracker/tracker-service';
import { CompletionBar } from './CompletionBar';

/** Tracker overview: each visible event with its completion roll-up. Drill into an event. */
export function TrackerOverviewScreen() {
  const { user, isAdmin, isOrganizer } = useAuth();
  const viewer = user ? { uid: user.uid, isAdmin, isOrganizer } : null;

  const query = useQuery({
    queryKey: ['tracker', 'overview', user?.uid],
    queryFn: () => listEventTrackerSummaries(viewer!),
    enabled: !!viewer,
  });

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-black tracking-tight text-brand">Advance tracker</h1>
        <p className="text-ink-muted">Section completion across your events. Drill in for the grid.</p>
      </header>

      {query.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {query.isError && <p className="text-sm text-accent">Failed to load the tracker.</p>}
      {query.data?.length === 0 && <p className="text-sm text-ink-muted">No events to track yet.</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {query.data?.map(({ event, counts, advanceCount }) => (
          <Link
            key={event.id}
            to={`/tracker/${event.id}`}
            className="block rounded-lg border border-line p-4 transition-colors hover:border-accent"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-brand">{event.name}</h2>
              <span className="text-xs text-ink-muted">{advanceCount} advances</span>
            </div>
            <p className="mb-3 text-sm text-ink-muted">{formatDateRange(event.startDate, event.endDate)}</p>
            <CompletionBar counts={counts} />
          </Link>
        ))}
      </div>
    </section>
  );
}
