/**
 * Tracker data access (ROADMAP §8). Shared lib (the tracker feature can't import the
 * events feature's services — no-cross-feature), so this reads Firestore directly via the
 * @/lib models, mirroring @/lib/rbac/membership.ts. Reads are member-gated by
 * firestore.rules; no writes. Pure aggregation lives in tracker.ts.
 *
 * The overview is PAGED, deliberately. Oversight viewers (admin / production director) can
 * see every event, and a single unpaged pass would fan one screen out into hundreds of stage
 * queries and thousands of advance reads. `listEventTrackerSummaries` therefore serves one
 * bounded page at a time and rolls up only that page, with a ceiling on how many roll-ups run
 * at once. See `planning/EVENT_OVERSIGHT_ROLE_PLAN.md` § Tracker performance guard.
 */
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { createLogger } from '@/lib/logger';
import { parseEvent, type EventRecord } from '@/lib/events/event';
import { EVENTS_READ_CAP, getEvent } from '@/lib/events/events-read';
import { parseStage } from '@/lib/events/stage';
import { parseAdvance } from '@/lib/advances/advance';
import { parseDepartment } from '@/lib/departments/department';
import { canOverseeAllEvents, type Viewer } from '@/lib/rbac/permissions';
import {
  listMyEventMemberships,
  productionManagerEventIds,
  type MyEventMembership,
} from '@/lib/rbac/my-memberships';
import {
  completionPct,
  rollUpEvent,
  sumCounts,
  type EventTracker,
  type LocatedAdvance,
  type StatusCounts,
  type TrackerColumn,
} from './tracker';

const logger = createLogger('TrackerService');

/** Events per overview page. Small on purpose — each one costs a full stage/advance walk. */
export const TRACKER_PAGE_SIZE = 25;

/** Per-event roll-ups allowed in flight at once. Do not raise this to "make it faster". */
export const TRACKER_ROLLUP_CONCURRENCY = 4;

/** One event's line in the overview: its details + completion roll-up. */
export interface EventTrackerSummary {
  event: EventRecord;
  counts: StatusCounts;
  pct: number;
  advanceCount: number;
}

/** The drill-in view: the event header + its grid. */
export interface EventTrackerView {
  event: EventRecord;
  tracker: EventTracker;
}

/**
 * Opaque "Load more" cursor. Serializable on purpose (no Firestore snapshot) so it can live in
 * component state or a React Query page param.
 */
export interface TrackerPageCursor {
  /** Name of the last event served — the `orderBy('name')` position to resume after. */
  name: string;
  /** Its id: the tiebreaker, so two events sharing a name can't be skipped or repeated. */
  id: string;
  /** Events served across all previous pages — this is what enforces `EVENTS_READ_CAP`. */
  loaded: number;
}

/** One page of the overview. */
export interface EventTrackerPage {
  summaries: EventTrackerSummary[];
  /** Cursor for the next page; `null` when there is nothing more to serve. */
  cursor: TrackerPageCursor | null;
  /**
   * `true` when the absolute `EVENTS_READ_CAP` ceiling — not the end of the data — stopped the
   * walk. More events exist and will not be served; surface this to the user.
   */
  capped: boolean;
}

export interface TrackerOverviewOptions {
  /** `null`/omitted = first page. */
  cursor?: TrackerPageCursor | null;
  pageSize?: number;
  concurrency?: number;
  /**
   * Pre-resolved cross-event membership summary (from `useMyEventMemberships`), so the
   * overview doesn't re-issue the shared collection-group read. Ignored for oversight
   * viewers, who never need it. Omit and this resolves the summary itself.
   */
  memberships?: readonly MyEventMembership[];
}

/**
 * Map over `items` with at most `concurrency` promises in flight, preserving input order.
 *
 * Exported so the read-amplification guard is unit-testable: this is the only thing standing
 * between a 25-event page and 25 simultaneous stage-plus-advance walks. Results keep their
 * input index, so callers can still zip them against the source list.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const bound = Math.max(1, Math.floor(concurrency) || 1);
  const workers = Math.min(bound, Math.max(items.length, 1));
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      // `next++` is synchronous, so workers can never claim the same index.
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index], index);
      }
    }),
  );
  return results;
}

/** Department id → display name, for resolving grid columns. */
async function loadDepartmentNames(): Promise<Map<string, string>> {
  const snap = await getDocs(collection(db, 'departments'));
  return new Map(snap.docs.map((d) => [d.id, parseDepartment(d.id, d.data()).name]));
}

/** Resolve an event's enabled departments into ordered grid columns. */
function eventColumns(event: EventRecord, deptNames: Map<string, string>): TrackerColumn[] {
  return event.departmentIds.map((id) => ({ id, name: deptNames.get(id) ?? id }));
}

/** Read every located advance for an event (stages → advances), ordered by stage. */
export async function listEventAdvances(eventId: string): Promise<LocatedAdvance[]> {
  const stageSnap = await getDocs(collection(db, 'events', eventId, 'stages'));
  const stages = stageSnap.docs
    .map((d) => parseStage(d.id, d.data()))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const perStage = await Promise.all(
    stages.map(async (stage) => {
      const advSnap = await getDocs(collection(db, 'events', eventId, 'stages', stage.id, 'advances'));
      return advSnap.docs.map((d) => ({
        stageId: stage.id,
        stageName: stage.name,
        advance: parseAdvance(d.id, d.data()),
      }));
    }),
  );
  return perStage.flat();
}

/** Full per-event grid: event header + columns (departments) × rows (advances). */
export async function getEventTracker(eventId: string): Promise<EventTrackerView | null> {
  const eventSnap = await getDoc(doc(db, 'events', eventId));
  if (!eventSnap.exists()) return null;
  const event = parseEvent(eventSnap.id, eventSnap.data());

  const [deptNames, located] = await Promise.all([loadDepartmentNames(), listEventAdvances(eventId)]);
  return { event, tracker: rollUpEvent(located, eventColumns(event, deptNames)) };
}

/** One event's overview line — the expensive unit the concurrency bound protects. */
async function summarizeEvent(event: EventRecord): Promise<EventTrackerSummary> {
  const located = await listEventAdvances(event.id);
  const counts = sumCounts(
    located.map((l) => {
      const c: StatusCounts = { not_started: 0, in_progress: 0, complete: 0, total: 0 };
      for (const deptId of event.departmentIds) {
        const status = l.advance.sections[deptId]?.status;
        if (status) {
          c[status] += 1;
          c.total += 1;
        }
      }
      return c;
    }),
  );
  return { event, counts, pct: completionPct(counts), advanceCount: located.length };
}

/** A page of events to roll up, before any summaries are computed. */
interface EventPage {
  events: EventRecord[];
  hasMore: boolean;
  capped: boolean;
}

/** Name-then-id ordering — the same total order the paged Firestore query uses. */
function byNameThenId(a: { name: string; id: string }, b: { name: string; id: string }): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/**
 * Oversight page: one ordered, cursored slice of `events`. Left in Firestore's own order —
 * re-sorting a page client-side would disagree with the byte-order cursor and make the
 * sequence of pages read non-monotonically.
 */
async function loadOversightPage(
  cursor: TrackerPageCursor | null,
  pageSize: number,
): Promise<EventPage> {
  const loaded = cursor?.loaded ?? 0;
  const remaining = EVENTS_READ_CAP - loaded;
  if (remaining <= 0) return { events: [], hasMore: false, capped: true };

  const size = Math.min(pageSize, remaining);
  // `documentId()` is the tiebreaker that makes the cursor exact; one extra row answers
  // "is there a next page?" without a second read.
  const constraints: QueryConstraint[] = [orderBy('name'), orderBy(documentId())];
  if (cursor) constraints.push(startAfter(cursor.name, cursor.id));
  constraints.push(limit(size + 1));
  const snap = await getDocs(query(collection(db, 'events'), ...constraints));

  const hasMore = snap.docs.length > size;
  const events = snap.docs.slice(0, size).map((d) => parseEvent(d.id, d.data()));
  return { events, hasMore, capped: hasMore && loaded + events.length >= EVENTS_READ_CAP };
}

/**
 * Membership page: the events where this user is the PRODUCTION MANAGER. Filtering the shared
 * membership summary by role happens before any event is loaded, so events where they are only
 * a lead or tech never enter the overview at all.
 */
async function loadMembershipPage(
  viewer: Viewer,
  memberships: readonly MyEventMembership[] | undefined,
  cursor: TrackerPageCursor | null,
  pageSize: number,
  concurrency: number,
): Promise<EventPage> {
  const summary = memberships ?? (await listMyEventMemberships(viewer.uid));
  const ids = productionManagerEventIds(summary);

  const fetched = await mapWithConcurrency(ids, concurrency, (id) => getEvent(id));
  const ordered = fetched.filter((e): e is EventRecord => e !== null).sort(byNameThenId);

  // The same absolute ceiling as the oversight branch — a PM roster this large is a bug, but
  // it must not translate into an unbounded roll-up either.
  const truncated = ordered.length > EVENTS_READ_CAP;
  const bounded = truncated ? ordered.slice(0, EVENTS_READ_CAP) : ordered;

  const start = cursor ? bounded.findIndex((e) => byNameThenId(e, cursor) > 0) : 0;
  if (start < 0) return { events: [], hasMore: false, capped: truncated };

  const events = bounded.slice(start, start + pageSize);
  const hasMore = start + events.length < bounded.length;
  return { events, hasMore, capped: truncated && !hasMore };
}

/**
 * Overview page: each event on the page with its completion roll-up, in stable name order.
 *
 * Oversight viewers (admin / production director) page through every event; everyone else
 * pages through the events they production-manage. Pass `cursor` from the previous page's
 * result to implement "Load more"; a `null` cursor back means the last page.
 */
export async function listEventTrackerSummaries(
  viewer: Viewer,
  options: TrackerOverviewOptions = {},
): Promise<EventTrackerPage> {
  const {
    cursor = null,
    pageSize = TRACKER_PAGE_SIZE,
    concurrency = TRACKER_ROLLUP_CONCURRENCY,
    memberships,
  } = options;
  const size = Math.max(1, Math.floor(pageSize) || 1);

  const page = canOverseeAllEvents(viewer)
    ? await loadOversightPage(cursor, size)
    : await loadMembershipPage(viewer, memberships, cursor, size, concurrency);

  if (page.capped) {
    logger.warn(
      `Tracker overview stopped at the ${EVENTS_READ_CAP}-event ceiling — further events will not be rolled up.`,
    );
  }

  const summaries = await mapWithConcurrency(page.events, concurrency, summarizeEvent);
  const last = page.events.at(-1);
  const nextCursor =
    page.hasMore && !page.capped && last
      ? { name: last.name, id: last.id, loaded: (cursor?.loaded ?? 0) + page.events.length }
      : null;

  return { summaries, cursor: nextCursor, capped: page.capped };
}
