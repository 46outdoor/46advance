import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { getDoc, getDocs } from 'firebase/firestore';
import { EVENTS_READ_CAP } from '@/lib/events/events-read';
import type { MyEventMembership } from '@/lib/rbac/my-memberships';
import {
  TRACKER_PAGE_SIZE,
  TRACKER_ROLLUP_CONCURRENCY,
  listEventTrackerSummaries,
  mapWithConcurrency,
  type TrackerPageCursor,
} from './tracker-service';

// Mock the Firestore app handle so no real Firebase is initialized.
vi.mock('@/services/firebase', () => ({ db: {} }));

/**
 * Keep the real `firebase/firestore` (the Zod schemas need `Timestamp`); stub the IO entry
 * points plus the builders. Unlike the other suites the builders here are *recorded*, not
 * discarded: paging is the thing under test, so the fake store has to honor `startAfter` and
 * `limit` for the cursor assertions to mean anything.
 */
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
    collectionGroup: vi.fn((_db: unknown, id: string) => ({ path: [id] })),
    doc: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
    documentId: vi.fn(() => '__name__'),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    limit: vi.fn((n: number) => ({ kind: 'limit', n })),
    orderBy: vi.fn((field: unknown) => ({ kind: 'orderBy', field })),
    query: vi.fn((source: unknown, ...constraints: unknown[]) => ({ source, constraints })),
    startAfter: vi.fn((...values: unknown[]) => ({ kind: 'startAfter', values })),
    where: vi.fn((field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value })),
  };
});

const mockGetDoc = getDoc as unknown as Mock;
const mockGetDocs = getDocs as unknown as Mock;

/* ------------------------------------------------------------------ fake Firestore store */

interface Constraint {
  kind: string;
  n?: number;
  values?: unknown[];
}
interface Source {
  path: string[];
}
interface Target extends Partial<Source> {
  source?: Source;
  constraints?: Constraint[];
}

interface FakeEvent {
  id: string;
  name: string;
}

/** Events in the fake `events` collection, plus the membership rows for `user-1`. */
let events: FakeEvent[] = [];
let memberRows: MyEventMembership[] = [];
/** Events whose stage collection was read — i.e. whose roll-up actually ran. */
let rolledUp: string[] = [];
/** Peak simultaneous stage reads, for the concurrency bound. */
let inFlight = 0;
let peakInFlight = 0;

const eventData = (name: string) => ({ name, status: 'active', createdBy: 'uid-1' });
const eventSnap = (e: FakeEvent) => ({ id: e.id, data: () => eventData(e.name) });

const byNameThenId = (a: FakeEvent, b: FakeEvent) =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/** `evt-01 … evt-NN`, named `Event 01 … Event NN` so name order and id order agree. */
function seedEvents(count: number): FakeEvent[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(3, '0');
    return { id: `evt-${n}`, name: `Event ${n}` };
  });
}

/** Resolve one ordered+cursored+limited page out of the fake `events` collection. */
function eventsPage(constraints: Constraint[]) {
  const after = constraints.find((c) => c.kind === 'startAfter');
  const cap = constraints.find((c) => c.kind === 'limit');
  let rows = [...events].sort(byNameThenId);
  if (after) {
    const [name, id] = (after.values ?? []) as [string, string];
    rows = rows.filter((e) => byNameThenId(e, { id, name }) > 0);
  }
  if (cap?.n !== undefined) rows = rows.slice(0, cap.n);
  return { size: rows.length, docs: rows.map(eventSnap) };
}

function memberDocs() {
  return {
    docs: memberRows.map((m) => ({
      ref: { parent: { parent: { id: m.eventId } } },
      data: () => ({ role: m.role, addedBy: 'admin-uid', addedAt: null }),
    })),
  };
}

/** Dispatch every `getDocs` by collection path: events page, members group, or stages. */
async function fakeGetDocs(target: unknown) {
  const t = target as Target;
  const path = t.source?.path ?? t.path ?? [];

  if (path.length === 1 && path[0] === 'members') return memberDocs();
  if (path.length === 1 && path[0] === 'events') return eventsPage(t.constraints ?? []);
  if (path.length === 3 && path[2] === 'stages') {
    rolledUp.push(path[1]);
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 0));
    inFlight -= 1;
    return { docs: [] };
  }
  return { docs: [] };
}

const ADMIN = { uid: 'admin-1', isAdmin: true, isOrganizer: false };
const DIRECTOR = {
  uid: 'director-1',
  isAdmin: false,
  isOrganizer: false,
  isProductionDirector: true,
};
const PM = { uid: 'user-1', isAdmin: false, isOrganizer: false };

beforeEach(() => {
  vi.clearAllMocks();
  events = [];
  memberRows = [];
  rolledUp = [];
  inFlight = 0;
  peakInFlight = 0;
  mockGetDocs.mockImplementation(fakeGetDocs);
  mockGetDoc.mockImplementation(async (ref: unknown) => {
    const path = (ref as Source).path;
    const found = events.find((e) => e.id === path[1]);
    return found
      ? { exists: () => true, id: found.id, data: () => eventData(found.name) }
      : { exists: () => false };
  });
});

/* ------------------------------------------------------------------ concurrency helper */

describe('mapWithConcurrency', () => {
  /** Resolves after a macrotask, so overlapping calls are actually observable. */
  const slow = async (value: number) => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return value * 2;
  };

  it('preserves input order regardless of completion order', async () => {
    const delays = [30, 0, 10, 20, 5];
    const out = await mapWithConcurrency(delays, 3, async (ms, i) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return i;
    });

    expect(out).toEqual([0, 1, 2, 3, 4]);
  });

  it('never runs more than `concurrency` at once', async () => {
    let running = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 0));
      running -= 1;
    });

    expect(peak).toBe(3);
  });

  it('runs everything when the bound exceeds the item count', async () => {
    expect(await mapWithConcurrency([1, 2, 3], 10, slow)).toEqual([2, 4, 6]);
  });

  it('handles an empty list without spawning a worker', async () => {
    const fn = vi.fn(slow);

    expect(await mapWithConcurrency([], 4, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  // A 0 or NaN bound must degrade to serial, never to "unbounded".
  it('coerces a nonsense bound to 1 rather than unbounded', async () => {
    let running = 0;
    let peak = 0;
    const track = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 0));
      running -= 1;
    };

    await mapWithConcurrency([1, 2, 3, 4], 0, track);
    expect(peak).toBe(1);

    peak = 0;
    await mapWithConcurrency([1, 2, 3, 4], Number.NaN, track);
    expect(peak).toBe(1);
  });
});

/* ------------------------------------------------------------------ oversight paging */

describe('listEventTrackerSummaries — oversight paging', () => {
  it('serves the first page at the default size and hands back a cursor', async () => {
    events = seedEvents(TRACKER_PAGE_SIZE + 5);

    const page = await listEventTrackerSummaries(ADMIN);

    expect(page.summaries).toHaveLength(TRACKER_PAGE_SIZE);
    expect(page.cursor).toEqual({
      name: `Event ${String(TRACKER_PAGE_SIZE).padStart(3, '0')}`,
      id: `evt-${String(TRACKER_PAGE_SIZE).padStart(3, '0')}`,
      loaded: TRACKER_PAGE_SIZE,
    });
    expect(page.capped).toBe(false);
  });

  // The whole point of the guard: a 30-event estate must not cost 30 stage walks per screen.
  it('rolls up only the events on the current page', async () => {
    events = seedEvents(30);

    await listEventTrackerSummaries(ADMIN, { pageSize: 4 });

    expect(rolledUp).toEqual(['evt-001', 'evt-002', 'evt-003', 'evt-004']);
  });

  it('a production director pages the all-events branch, not memberships', async () => {
    events = seedEvents(3);
    memberRows = [{ eventId: 'evt-001', role: 'production-manager' }];

    const page = await listEventTrackerSummaries(DIRECTOR, { pageSize: 2 });

    expect(page.summaries.map((s) => s.event.id)).toEqual(['evt-001', 'evt-002']);
    expect(mockGetDoc).not.toHaveBeenCalled(); // no per-membership event fetch
  });

  it('"Load more" continues after the cursor with stable order and no duplicates', async () => {
    events = seedEvents(7);

    const seen: string[] = [];
    let cursor: TrackerPageCursor | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof listEventTrackerSummaries>> =
        await listEventTrackerSummaries(ADMIN, { pageSize: 3, cursor });
      seen.push(...page.summaries.map((s) => s.event.id));
      cursor = page.cursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(seen).toEqual(events.map((e) => e.id));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('returns a null cursor on an exactly-full final page', async () => {
    events = seedEvents(6);

    const first = await listEventTrackerSummaries(ADMIN, { pageSize: 3 });
    const second = await listEventTrackerSummaries(ADMIN, { pageSize: 3, cursor: first.cursor });

    expect(second.summaries.map((s) => s.event.id)).toEqual(['evt-004', 'evt-005', 'evt-006']);
    expect(second.cursor).toBeNull();
    expect(second.capped).toBe(false);
  });

  // Events sharing a name are why the cursor carries the id: on `name` alone the second
  // "Main Stage Fest" would be skipped.
  it('does not skip events that share a name', async () => {
    events = [
      { id: 'evt-a', name: 'Twin' },
      { id: 'evt-b', name: 'Twin' },
      { id: 'evt-c', name: 'Zulu' },
    ];

    const first = await listEventTrackerSummaries(ADMIN, { pageSize: 1 });
    const second = await listEventTrackerSummaries(ADMIN, { pageSize: 1, cursor: first.cursor });

    expect(first.summaries.map((s) => s.event.id)).toEqual(['evt-a']);
    expect(second.summaries.map((s) => s.event.id)).toEqual(['evt-b']);
  });

  it('bounds concurrent roll-ups to the default', async () => {
    events = seedEvents(20);

    await listEventTrackerSummaries(ADMIN, { pageSize: 20 });

    expect(peakInFlight).toBe(TRACKER_ROLLUP_CONCURRENCY);
  });

  it('honors an explicit concurrency bound', async () => {
    events = seedEvents(20);

    await listEventTrackerSummaries(ADMIN, { pageSize: 20, concurrency: 2 });

    expect(peakInFlight).toBe(2);
  });
});

/* ------------------------------------------------------------------ absolute ceiling */

describe('listEventTrackerSummaries — EVENTS_READ_CAP ceiling', () => {
  // Hitting the ceiling logs a warning by design; keep it out of the suite's output.
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // The cap is the absolute defensive ceiling, NOT the page size: paging walks up to it and
  // then stops, reporting `capped` so the screen can say so.
  it('stops at the ceiling and withholds a further cursor', async () => {
    events = seedEvents(5);
    const cursor: TrackerPageCursor = { name: 'Event 000', id: 'evt-000', loaded: EVENTS_READ_CAP - 1 };

    const page = await listEventTrackerSummaries(ADMIN, { pageSize: TRACKER_PAGE_SIZE, cursor });

    expect(page.summaries).toHaveLength(1); // only the one slot left under the ceiling
    expect(page.capped).toBe(true);
    expect(page.cursor).toBeNull();
  });

  it('serves nothing once a stale cursor is already past the ceiling', async () => {
    events = seedEvents(5);
    const cursor: TrackerPageCursor = { name: 'Event 000', id: 'evt-000', loaded: EVENTS_READ_CAP };

    const page = await listEventTrackerSummaries(ADMIN, { cursor });

    expect(page.summaries).toEqual([]);
    expect(page.capped).toBe(true);
    expect(rolledUp).toEqual([]);
  });
});

/* ------------------------------------------------------------------ PM (membership) branch */

describe('listEventTrackerSummaries — production-manager scope', () => {
  beforeEach(() => {
    events = seedEvents(4);
    memberRows = [
      { eventId: 'evt-001', role: 'production-manager' },
      { eventId: 'evt-002', role: 'tech' },
      { eventId: 'evt-003', role: 'department-lead' },
      { eventId: 'evt-004', role: 'production-manager' },
    ];
  });

  // Filtering happens BEFORE the events load: an event the user only techs on must never be
  // read, let alone rolled up.
  it('lists only the events the user production-manages', async () => {
    const page = await listEventTrackerSummaries(PM);

    expect(page.summaries.map((s) => s.event.id)).toEqual(['evt-001', 'evt-004']);
    expect(rolledUp).toEqual(['evt-001', 'evt-004']);
  });

  it('never loads the event documents for lead/tech memberships', async () => {
    await listEventTrackerSummaries(PM);

    const loaded = mockGetDoc.mock.calls.map((c) => (c[0] as Source).path[1]);
    expect(loaded).toEqual(['evt-001', 'evt-004']);
  });

  it('returns nothing for a user who is only a lead or tech', async () => {
    memberRows = [{ eventId: 'evt-002', role: 'tech' }];

    const page = await listEventTrackerSummaries(PM);

    expect(page.summaries).toEqual([]);
    expect(page.cursor).toBeNull();
    expect(rolledUp).toEqual([]);
  });

  it('reuses a pre-resolved membership summary instead of re-querying', async () => {
    const page = await listEventTrackerSummaries(PM, {
      memberships: [{ eventId: 'evt-003', role: 'production-manager' }],
    });

    expect(page.summaries.map((s) => s.event.id)).toEqual(['evt-003']);
    // Only the stage read for evt-003 — no members collection-group query.
    expect(mockGetDocs.mock.calls.map((c) => (c[0] as Target).source?.path?.[0])).not.toContain(
      'members',
    );
  });

  it('drops memberships whose event no longer exists', async () => {
    memberRows = [
      { eventId: 'evt-001', role: 'production-manager' },
      { eventId: 'ghost', role: 'production-manager' },
    ];

    const page = await listEventTrackerSummaries(PM);

    expect(page.summaries.map((s) => s.event.id)).toEqual(['evt-001']);
  });

  it('pages the PM list in stable name order', async () => {
    memberRows = events.map((e) => ({ eventId: e.id, role: 'production-manager' as const }));

    const first = await listEventTrackerSummaries(PM, { pageSize: 3 });
    const second = await listEventTrackerSummaries(PM, { pageSize: 3, cursor: first.cursor });

    expect(first.summaries.map((s) => s.event.id)).toEqual(['evt-001', 'evt-002', 'evt-003']);
    expect(first.cursor).not.toBeNull();
    expect(second.summaries.map((s) => s.event.id)).toEqual(['evt-004']);
    expect(second.cursor).toBeNull();
  });

  it('bounds concurrency on the membership branch too', async () => {
    events = seedEvents(12);
    memberRows = events.map((e) => ({ eventId: e.id, role: 'production-manager' as const }));

    await listEventTrackerSummaries(PM, { pageSize: 12, concurrency: 3 });

    expect(peakInFlight).toBe(3);
  });
});
