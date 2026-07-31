import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { getDoc, getDocs } from 'firebase/firestore';
import { EVENTS_READ_CAP, getEvent, listEvents } from './events-read';

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

/** Minimal stored event: the fields `eventDocSchema` actually requires. */
const eventDoc = (name: string) => ({ name, status: 'active', createdBy: 'uid-1' });

function eventsSnapshot(names: string[], size = names.length) {
  return {
    size,
    docs: names.map((name, i) => ({ id: `evt-${i}`, data: () => eventDoc(name) })),
  };
}

/** A `members` collection-group result: each doc's grandparent is its event. */
function membersSnapshot(eventIds: string[]) {
  return {
    docs: eventIds.map((id) => ({ ref: { parent: { parent: { id } } } })),
  };
}

const ADMIN = { uid: 'admin-1', isAdmin: true, isOrganizer: false };
const MEMBER = { uid: 'user-1', isAdmin: false, isOrganizer: false };

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

  it('sorts by name regardless of the order returned', async () => {
    mockGetDocs.mockResolvedValue(eventsSnapshot(['Zulu', 'Alpha', 'Mike']));

    expect((await listEvents(ADMIN)).map((e) => e.name)).toEqual(['Alpha', 'Mike', 'Zulu']);
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
});
