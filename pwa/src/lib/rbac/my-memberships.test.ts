import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { getDocs, where } from 'firebase/firestore';
import {
  isProductionManagerSomewhere,
  listMyEventMemberships,
  myEventMembershipsKey,
  productionManagerEventIds,
  type MyEventMembership,
} from './my-memberships';

// Mock the Firestore app handle so no real Firebase is initialized.
vi.mock('@/services/firebase', () => ({ db: {} }));

// Keep the real `firebase/firestore` (roles.ts's schema needs `Timestamp`); only stub the IO
// entry point and the query builders. `where` stays a spy so the self-only filter is assertable.
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collectionGroup: vi.fn(() => ({})),
    getDocs: vi.fn(),
    query: vi.fn(() => ({})),
    where: vi.fn(),
  };
});

const mockGetDocs = getDocs as unknown as Mock;
const mockWhere = where as unknown as Mock;

/** A `members` collection-group result: each doc's grandparent is its event. */
function membersSnapshot(rows: { eventId: string; data: Record<string, unknown> }[]) {
  return {
    docs: rows.map((r) => ({
      ref: { parent: { parent: { id: r.eventId } } },
      data: () => r.data,
    })),
  };
}

const member = (role: string) => ({ role, addedBy: 'admin-uid', addedAt: null });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listMyEventMemberships', () => {
  it('returns the event id AND the role for every membership', async () => {
    mockGetDocs.mockResolvedValue(
      membersSnapshot([
        { eventId: 'evt-a', data: member('production-manager') },
        { eventId: 'evt-b', data: member('tech') },
      ]),
    );

    expect(await listMyEventMemberships('user-1')).toEqual([
      { eventId: 'evt-a', role: 'production-manager' },
      { eventId: 'evt-b', role: 'tech' },
    ]);
  });

  // The collection-group rule is self-only; a query without this filter is denied outright.
  it('filters the collection group to the caller own uid', async () => {
    mockGetDocs.mockResolvedValue(membersSnapshot([]));

    await listMyEventMemberships('user-1');

    expect(mockWhere).toHaveBeenCalledWith('uid', '==', 'user-1');
  });

  it('returns an empty list when the user holds no memberships', async () => {
    mockGetDocs.mockResolvedValue(membersSnapshot([]));

    expect(await listMyEventMemberships('user-1')).toEqual([]);
  });

  it('drops rows whose grandparent event id cannot be resolved', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { ref: { parent: { parent: null } }, data: () => member('tech') },
        { ref: { parent: { parent: { id: 'evt-a' } } }, data: () => member('tech') },
      ],
    });

    expect(await listMyEventMemberships('user-1')).toEqual([{ eventId: 'evt-a', role: 'tech' }]);
  });

  // This read gates navigation and the whole events list, so one malformed member document
  // must degrade to "not a member there" — never throw and blank the app.
  it('skips a row with an unrecognized role instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetDocs.mockResolvedValue(
      membersSnapshot([
        { eventId: 'evt-a', data: member('overlord') },
        { eventId: 'evt-b', data: member('production-manager') },
      ]),
    );

    expect(await listMyEventMemberships('user-1')).toEqual([
      { eventId: 'evt-b', role: 'production-manager' },
    ]);
    warn.mockRestore();
  });

  it('collapses duplicate rows for the same event', async () => {
    mockGetDocs.mockResolvedValue(
      membersSnapshot([
        { eventId: 'evt-a', data: member('production-manager') },
        { eventId: 'evt-a', data: member('tech') },
      ]),
    );

    expect(await listMyEventMemberships('user-1')).toEqual([
      { eventId: 'evt-a', role: 'production-manager' },
    ]);
  });
});

describe('myEventMembershipsKey', () => {
  it('is scoped to the uid so an account switch cannot reuse the entry', () => {
    expect(myEventMembershipsKey('user-1')).toEqual(['rbac', 'my-memberships', 'user-1']);
    expect(myEventMembershipsKey('user-2')).not.toEqual(myEventMembershipsKey('user-1'));
  });

  it('is stable while the uid is unresolved', () => {
    expect(myEventMembershipsKey(undefined)).toEqual(['rbac', 'my-memberships', null]);
  });
});

describe('role helpers', () => {
  const memberships: MyEventMembership[] = [
    { eventId: 'evt-a', role: 'production-manager' },
    { eventId: 'evt-b', role: 'tech' },
    { eventId: 'evt-c', role: 'department-lead' },
    { eventId: 'evt-d', role: 'production-manager' },
  ];

  it('productionManagerEventIds keeps only the events the user runs', () => {
    expect(productionManagerEventIds(memberships)).toEqual(['evt-a', 'evt-d']);
  });

  it('productionManagerEventIds is empty for a lead/tech-only user', () => {
    expect(productionManagerEventIds(memberships.slice(1, 3))).toEqual([]);
  });

  it('isProductionManagerSomewhere resolves the tri-state', () => {
    expect(isProductionManagerSomewhere(memberships)).toBe(true);
    expect(isProductionManagerSomewhere([{ eventId: 'evt-b', role: 'tech' }])).toBe(false);
    expect(isProductionManagerSomewhere([])).toBe(false);
  });

  // `undefined` must stay `undefined`: collapsing "still loading" to `false` makes the Tracker
  // link render hidden and then pop in once the summary resolves.
  it('isProductionManagerSomewhere stays unknown while the summary is unresolved', () => {
    expect(isProductionManagerSomewhere(undefined)).toBeUndefined();
  });
});
