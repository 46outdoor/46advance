import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { getDoc, getDocs, Timestamp } from 'firebase/firestore';
import {
  EVENTS_READ_CAP,
  eventsListKey,
  eventsListScope,
  getEvent,
  listEvents,
} from './events-read';

// Mock the Firestore app handle so no real Firebase is initialized.
vi.mock('@/services/firebase', () => ({ db: {} }));

// Keep the real `firebase/firestore` (event.ts's schema needs `Timestamp`); only stub the
// IO entry points and the query builders, which we don't assert on.
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(() => ({})),
    collectionGroup: vi.fn(() => ({})),
    doc: vi.fn((_db: unknown, path: string, id: string) => ({ path: `${path}/${id}` })),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    query: vi.fn(() => ({})),
    where: vi.fn(),
  };
});

const mockGetDoc = getDoc as unknown as Mock;
const mockGetDocs = getDocs as unknown as Mock;

/** Minimal stored event: the fields `eventDocSchema` actually requires, plus an optional
 *  start date — the list is ordered chronologically, so most sort tests need one. */
const eventDoc = (name: string, startDate?: string) => ({
  name,
  status: 'active',
  createdBy: 'uid-1',
  ...(startDate ? { startDate: Timestamp.fromDate(new Date(`${startDate}T12:00:00Z`)) } : {}),
});

/** `names` entries may be `'Name'` or `['Name', '2026-08-15']` to give the event a start date. */
function eventsSnapshot(names: (string | [string, string])[], size = names.length) {
  return {
    size,
    docs: names.map((entry, i) => {
      const [name, date] = Array.isArray(entry) ? entry : [entry, undefined];
      return { id: `evt-${i}`, data: () => eventDoc(name, date) };
    }),
  };
}

/**
 * A `members` collection-group result (what `listMyEventMemberships` reads): each doc's
 * grandparent is its event, and the row carries the role.
 */
function membersSnapshot(eventIds: string[]) {
  return {
    docs: eventIds.map((id) => ({
      ref: { parent: { parent: { id } } },
      data: () => ({ role: 'tech', addedBy: 'admin-uid', addedAt: null }),
    })),
  };
}

const ADMIN = { uid: 'admin-1', isAdmin: true, isOrganizer: false };
const MEMBER = { uid: 'user-1', isAdmin: false, isOrganizer: false };
/** Production director: global read-only oversight, no memberships, not an admin. */
const DIRECTOR = {
  uid: 'director-1',
  isAdmin: false,
  isOrganizer: false,
  isProductionDirector: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getEvent', () => {
  it('parses the document when it exists', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, id: 'evt-1', data: () => eventDoc('Alpha') });

    expect(await getEvent('evt-1')).toMatchObject({ id: 'evt-1', name: 'Alpha' });
  });

  it('returns null for a missing document', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });

    expect(await getEvent('gone')).toBeNull();
  });
});

describe('listEvents', () => {
  it('an admin reads every event in one query', async () => {
    mockGetDocs.mockResolvedValue(eventsSnapshot(['Alpha', 'Beta']));

    const events = await listEvents(ADMIN);

    expect(events.map((e) => e.name)).toEqual(['Alpha', 'Beta']);
    expect(mockGetDocs).toHaveBeenCalledTimes(1); // no per-event fetch on the admin path
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  // Chronological, not alphabetical (decided 2026-08-10). Event names embed the city, so an
  // alphabetical sort ordered a touring festival by city — see `compareEventsByDate`.
  it('sorts soonest-first regardless of the order returned', async () => {
    mockGetDocs.mockResolvedValue(
      eventsSnapshot([
        ['Zulu', '2026-06-01'],
        ['Alpha', '2026-09-01'],
        ['Mike', '2026-07-01'],
      ]),
    );

    // Deliberately the exact inverse of alphabetical, so a regression to `localeCompare`
    // fails rather than coincidentally passing.
    expect((await listEvents(ADMIN)).map((e) => e.name)).toEqual(['Zulu', 'Mike', 'Alpha']);
  });

  it('puts undated events last, not first', async () => {
    mockGetDocs.mockResolvedValue(
      eventsSnapshot(['Aardvark', ['Scheduled', '2026-09-01'], 'Zebra']),
    );

    // An undated event is normally an unfinished stub; leading with it would bury the show
    // that is actually next. Undated events fall back to name order among themselves.
    expect((await listEvents(ADMIN)).map((e) => e.name)).toEqual([
      'Scheduled',
      'Aardvark',
      'Zebra',
    ]);
  });

  // The oversight branch is the capability, not the admin flag: a production director holds
  // no membership rows at all, so falling through to the membership path would show them
  // nothing.
  it('a production director reads every event, like an admin', async () => {
    mockGetDocs.mockResolvedValue(eventsSnapshot(['Alpha', 'Beta']));

    const events = await listEvents(DIRECTOR);

    expect(events.map((e) => e.name)).toEqual(['Alpha', 'Beta']);
    expect(mockGetDocs).toHaveBeenCalledTimes(1); // the all-events query, not a membership read
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  // The cap is a silent correctness limit — past it, an admin is served a truncated list, so
  // hitting it has to be loud enough to prompt pagination rather than look like "all events".
  it('warns when the admin read hits the cap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetDocs.mockResolvedValue(eventsSnapshot(['Alpha'], EVENTS_READ_CAP));

    await listEvents(ADMIN);

    // createLogger emits `console.warn(line, detail ?? '')` — two args, always.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(String(EVENTS_READ_CAP)), '');
    warn.mockRestore();
  });

  it('a non-admin gets only the events they hold a membership on', async () => {
    mockGetDocs.mockResolvedValue(membersSnapshot(['evt-a', 'evt-b']));
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true, id: 'evt-a', data: () => eventDoc('Alpha') })
      .mockResolvedValueOnce({ exists: () => true, id: 'evt-b', data: () => eventDoc('Beta') });

    const events = await listEvents(MEMBER);

    expect(events.map((e) => e.id)).toEqual(['evt-a', 'evt-b']);
  });

  // A membership can outlive the event it points at (deleted event, cascade mid-flight); those
  // resolve to null and must be dropped rather than surfacing as holes in the list.
  it('drops memberships whose event no longer exists', async () => {
    mockGetDocs.mockResolvedValue(membersSnapshot(['evt-a', 'ghost']));
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true, id: 'evt-a', data: () => eventDoc('Alpha') })
      .mockResolvedValueOnce({ exists: () => false });

    expect((await listEvents(MEMBER)).map((e) => e.name)).toEqual(['Alpha']);
  });

  it('returns an empty list when the user holds no memberships', async () => {
    mockGetDocs.mockResolvedValue(membersSnapshot([]));

    expect(await listEvents(MEMBER)).toEqual([]);
  });

  // The membership branch now consumes the shared cross-event summary; a second
  // collection-group read here would defeat the point of centralizing it.
  it('a non-admin issues exactly one membership query', async () => {
    mockGetDocs.mockResolvedValue(membersSnapshot(['evt-a', 'evt-b']));
    mockGetDoc.mockResolvedValue({ exists: () => false });

    await listEvents(MEMBER);

    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });
});

describe('eventsListKey', () => {
  it('scopes a member to their memberships', () => {
    expect(eventsListKey(MEMBER)).toEqual(['events', 'list', 'user-1', 'membership']);
  });

  it('scopes admins and directors to the all-events result', () => {
    expect(eventsListKey(ADMIN)).toEqual(['events', 'list', 'admin-1', 'all']);
    expect(eventsListKey(DIRECTOR)).toEqual(['events', 'list', 'director-1', 'all']);
  });

  // React Query is cleared on an auth IDENTITY change, not on a claim refresh. Same uid,
  // widened claim: without the scope segment the director would keep being served the
  // membership-scoped list they cached before the grant.
  it('changes when the same uid gains the director claim mid-session', () => {
    const before = eventsListKey({ uid: 'user-1', isAdmin: false, isOrganizer: false });
    const after = eventsListKey({
      uid: 'user-1',
      isAdmin: false,
      isOrganizer: false,
      isProductionDirector: true,
    });

    expect(before).not.toEqual(after);
    expect(after).toEqual(['events', 'list', 'user-1', 'all']);
  });

  it('stays stable while the viewer is unresolved', () => {
    expect(eventsListKey(null)).toEqual(['events', 'list', null, 'membership']);
    expect(eventsListKey(undefined)).toEqual(eventsListKey(null));
  });

  // Organizer is a creation capability, not an oversight one — it must not widen the list.
  it('does not widen the scope for an organizer', () => {
    expect(eventsListScope({ uid: 'org-1', isAdmin: false, isOrganizer: true })).toBe('membership');
  });
});
