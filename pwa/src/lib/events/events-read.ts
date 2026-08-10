/**
 * Event reads shared across features. These live in `lib/` rather than `features/events/`
 * because more than one feature needs them — the events list, and the template editor's
 * push-to-existing-events target picker — and a feature may never import from another
 * feature (`.dependency-cruiser.cjs` → `no-cross-feature`).
 *
 * Writes stay in `features/events/events-service.ts`; only the reads are shared.
 */
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { createLogger } from '@/lib/logger';
import { parseEvent, type EventRecord } from '@/lib/events/event';
import { canOverseeAllEvents, type Viewer } from '@/lib/rbac/permissions';
import { listMyEventMemberships } from '@/lib/rbac/my-memberships';

const logger = createLogger('EventsRead');

/**
 * Defensive ceiling on the all-events (admin / production-director) read; if hit, add cursor
 * pagination. The Tracker overview already pages, and reuses this as its absolute ceiling
 * rather than as a page size — see `tracker-service.ts`.
 */
export const EVENTS_READ_CAP = 500;

/**
 * Which set of events a viewer's list resolves to. `all` covers admins *and* production
 * directors — they read the identical set, so they may legitimately share a cache entry.
 */
export type EventsListScope = 'all' | 'membership';

export const eventsListScope = (viewer: Viewer | null | undefined): EventsListScope =>
  viewer != null && canOverseeAllEvents(viewer) ? 'all' : 'membership';

/**
 * The canonical React Query key for `listEvents`. Use it everywhere that calls the reader —
 * never a literal — so every consumer shares one cache entry.
 *
 * The scope segment is load-bearing, not decoration: React Query is only cleared on an auth
 * *identity* transition, so granting the production-director claim to the same uid leaves the
 * cache intact. Without the scope, the newly-widened viewer would be served their old
 * membership-scoped list under an identical key.
 */
export const eventsListKey = (viewer: Viewer | null | undefined) =>
  ['events', 'list', viewer?.uid ?? null, eventsListScope(viewer)] as const;

export async function getEvent(eventId: string): Promise<EventRecord | null> {
  const snap = await getDoc(doc(db, 'events', eventId));
  return snap.exists() ? parseEvent(snap.id, snap.data()) : null;
}

/**
 * Events the viewer can see: every event for oversight capabilities (admin or production
 * director), otherwise the events they hold a membership on.
 *
 * Callers that must stay membership-scoped regardless of the caller's global claims — the
 * Calendar Feed picker, whose feed only ever contains events the subscriber is a member of —
 * pass a viewer with the oversight flags cleared. Keep that: a director must not silently
 * subscribe to every event in the application.
 */
export async function listEvents(viewer: Viewer): Promise<EventRecord[]> {
  let events: EventRecord[];
  if (canOverseeAllEvents(viewer)) {
    const snap = await getDocs(
      query(collection(db, 'events'), orderBy('name'), limit(EVENTS_READ_CAP)),
    );
    if (snap.size >= EVENTS_READ_CAP) {
      logger.warn(
        `All-events list (admin/production-director) hit the ${EVENTS_READ_CAP}-event read cap — add pagination.`,
      );
    }
    events = snap.docs.map((d) => parseEvent(d.id, d.data()));
  } else {
    // The shared cross-event summary — one self-only collection-group read, shared with the
    // nav/Tracker via `useMyEventMemberships`. Do not re-issue that query here.
    const memberships = await listMyEventMemberships(viewer.uid);
    const fetched = await Promise.all(memberships.map((m) => getEvent(m.eventId)));
    events = fetched.filter((e): e is EventRecord => e !== null);
  }
  return events.sort((a, b) => a.name.localeCompare(b.name));
}
