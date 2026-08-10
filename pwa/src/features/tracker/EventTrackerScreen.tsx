import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { formatDateRange } from '@/lib/dates/formatting';
import { getEventMember } from '@/lib/rbac/membership';
import { canOverseeAllEvents, canViewTrackerForEvent } from '@/lib/rbac/permissions';
import { getEventTracker } from '@/lib/tracker/tracker-service';
import { CompletionBar } from './CompletionBar';
import { TrackerGrid } from './TrackerGrid';

/** Per-event tracker grid: advances × departments, status-colored. */
export function EventTrackerScreen() {
  const { eventId } = useParams();
  const { user, isAdmin, isOrganizer, isProductionDirector } = useAuth();
  const viewer = user ? { uid: user.uid, isAdmin, isOrganizer, isProductionDirector } : null;
  // Oversight (admin / production director) opens any event's tracker, so its role read is
  // skipped entirely rather than fetched and ignored.
  const oversees = !!viewer && canOverseeAllEvents(viewer);

  // Tracker links carry the raw doc id (not a slug), so the role reads against `eventId`
  // directly — the same per-event membership lookup the event screens use.
  const memberQuery = useQuery({
    queryKey: ['events', 'member', eventId, user?.uid],
    queryFn: () => getEventMember(user!.uid, eventId!),
    enabled: !!eventId && !!user && !oversees,
  });

  // TRI-STATE: `undefined` while the membership read is in flight. Only a resolved role may
  // deny — redirecting on "not known yet" would bounce a PM out on a slow query.
  const role = oversees || memberQuery.isPending ? undefined : (memberQuery.data?.role ?? null);
  const canView = !!viewer && canViewTrackerForEvent(viewer, role ?? null);

  const query = useQuery({
    // Scoped by capability: a claim grant doesn't clear React Query, so without this a viewer
    // made a director mid-session would keep being served the cached "no access" result.
    queryKey: ['tracker', 'event', eventId, oversees ? 'all' : 'member'],
    queryFn: () => getEventTracker(eventId!),
    enabled: !!eventId && canView,
  });

  if (!eventId || !viewer) return null;
  // Denied only once the role is known; `!canView` past this point means "still resolving".
  if (!canView && role !== undefined) return <Navigate to="/events" replace />;

  const view = query.data;

  return (
    <section className="space-y-6">
      <Link to="/tracker" className="text-sm text-ink-muted hover:text-accent">
        ← Tracker
      </Link>

      {(!canView || query.isLoading) && <p className="text-sm text-ink-muted">Loading…</p>}
      {query.isError && <p className="text-sm text-accent">Failed to load this tracker.</p>}
      {query.data === null && (
        <p className="text-sm text-ink-muted">Event not found, or you don’t have access.</p>
      )}

      {view && (
        <>
          <header className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl font-black tracking-tight text-brand">
                  {view.event.name}
                </h1>
                <p className="text-ink-muted">
                  {formatDateRange(view.event.startDate, view.event.endDate)}
                </p>
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
