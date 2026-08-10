import { Link, Navigate } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { formatDateRange } from '@/lib/dates/formatting';
import { canOverseeAllEvents, canViewTracker } from '@/lib/rbac/permissions';
import { isProductionManagerSomewhere } from '@/lib/rbac/my-memberships';
import { useMyEventMemberships } from '@/lib/rbac/useMyEventMemberships';
import {
  listEventTrackerSummaries,
  type TrackerPageCursor,
} from '@/lib/tracker/tracker-service';
import { CompletionBar } from './CompletionBar';

/** Tracker overview: each visible event with its completion roll-up. Drill into an event. */
export function TrackerOverviewScreen() {
  const { user, isAdmin, isOrganizer, isProductionDirector } = useAuth();
  const viewer = user ? { uid: user.uid, isAdmin, isOrganizer, isProductionDirector } : null;

  // The shared cross-event summary: it decides both whether this route is allowed at all and,
  // for a PM, which events the overview pages through — so it's passed straight to the service
  // rather than letting it re-issue the same collection-group read.
  const memberships = useMyEventMemberships();
  const isPmSomewhere = isProductionManagerSomewhere(memberships.data);
  const canView = !!viewer && canViewTracker(viewer, isPmSomewhere);
  // TRI-STATE. `canViewTracker` reports "not known yet" as false, so a plain `!canView` would
  // bounce a PM out of the Tracker on a slow membership query. Oversight is already true by
  // this point, so "false while the summary is unresolved" can only mean "still resolving".
  const resolving = !canView && isPmSomewhere === undefined;

  const query = useInfiniteQuery({
    // The scope segment matters: React Query is only cleared on an auth *identity* transition,
    // so granting the director claim to the same uid would otherwise serve their old,
    // membership-scoped page from cache.
    queryKey: [
      'tracker',
      'overview',
      user?.uid,
      viewer && canOverseeAllEvents(viewer) ? 'all' : 'pm',
    ],
    queryFn: ({ pageParam }) =>
      listEventTrackerSummaries(viewer!, { cursor: pageParam, memberships: memberships.data }),
    initialPageParam: null as TrackerPageCursor | null,
    // A null cursor back means the last page — React Query then reports no next page.
    getNextPageParam: (last) => last.cursor,
    enabled: canView,
  });

  if (!viewer) return null;
  if (!canView && !resolving) return <Navigate to="/events" replace />;

  const pages = query.data?.pages ?? [];
  const summaries = pages.flatMap((p) => p.summaries);
  // The absolute EVENTS_READ_CAP ceiling stopped the walk — more events exist and won't load.
  const capped = pages.some((p) => p.capped);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-black tracking-tight text-brand">
          Advance tracker
        </h1>
        <p className="text-ink-muted">
          Section completion across your events. Drill in for the grid.
        </p>
      </header>

      {(resolving || query.isLoading) && <p className="text-sm text-ink-muted">Loading…</p>}
      {query.isError && <p className="text-sm text-accent">Failed to load the tracker.</p>}
      {query.isSuccess && summaries.length === 0 && (
        <p className="text-sm text-ink-muted">No events to track yet.</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {summaries.map(({ event, counts, advanceCount }) => (
          <Link
            key={event.id}
            to={`/tracker/${event.id}`}
            className="block rounded-lg border border-line p-4 transition-colors hover:border-accent"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-brand">{event.name}</h2>
              <span className="text-xs text-ink-muted">{advanceCount} advances</span>
            </div>
            <p className="mb-3 text-sm text-ink-muted">
              {formatDateRange(event.startDate, event.endDate)}
            </p>
            <CompletionBar counts={counts} />
          </Link>
        ))}
      </div>

      {query.hasNextPage && (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="rounded border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
      {capped && (
        <p className="text-sm text-ink-muted">
          Showing the first {summaries.length} events — there are more than this page can roll
          up. Narrow the work down from the Events list.
        </p>
      )}
    </section>
  );
}
