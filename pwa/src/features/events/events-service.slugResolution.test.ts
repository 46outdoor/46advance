/**
 * `getEventBySlugOrId` — the three-step resolution.
 *
 * The bug this pins (found in production 2026-08-10): a member could not open an event by its
 * slug. The `where('slug','==')` query is denied for anyone whose event read rule needs a
 * per-document `exists()` membership lookup, and the old fallback — a getDoc treating the SLUG
 * as a doc id — was *also* denied rather than empty, so it threw instead of returning null. The
 * screen showed "Failed to load this event." on a show the viewer was assigned to.
 *
 * These are unit tests over the mocked Firestore entry points, so they assert the CONTROL FLOW:
 * which reads happen, in what order, and what a denial at each step leads to. The rules
 * behaviour they stand in for (which reads a member is actually denied) is covered against a
 * real emulator in `test/firestore.rules.test.ts` and end-to-end in
 * `tests/emulator/event-routing.emulator.spec.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/firebase', () => ({ db: {}, functions: {}, storage: {} }));

const getDocsMock = vi.fn();
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
}));

const getEventMock = vi.fn();
vi.mock('@/lib/events/events-read', () => ({ getEvent: (id: string) => getEventMock(id) }));

const listMyEventMembershipsMock = vi.fn();
vi.mock('@/lib/rbac/my-memberships', () => ({
  listMyEventMemberships: (uid: string) => listMyEventMembershipsMock(uid),
}));

const { getEventBySlugOrId } = await import('./events-service');

const UID = 'user-pm';
/** Raw Firestore data — goes through the REAL `parseEvent`, so it must satisfy the schema. */
const EVENT_DOC = {
  name: 'Alpha Festival',
  slug: 'alpha-festival',
  status: 'active',
  createdBy: 'admin-1',
};
/** What the mocked `getEvent` hands back: already-parsed. */
const EVENT = { id: 'evt-1', slug: 'alpha-festival', name: 'Alpha Festival' };

/** What the Firestore SDK throws when rules reject a read. */
const denied = () =>
  Object.assign(new Error('Missing or insufficient permissions.'), {
    code: 'permission-denied',
  });

const emptyQuery = () => ({ empty: true, docs: [] });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getEventBySlugOrId', () => {
  it('oversight viewer: the slug query answers in one read', async () => {
    getDocsMock.mockResolvedValue({
      empty: false,
      docs: [{ id: EVENT.id, data: () => EVENT_DOC }],
    });

    const found = await getEventBySlugOrId('alpha-festival', UID);

    expect(found?.id).toBe(EVENT.id);
    // No doc-id probe, and crucially no membership fan-out for a viewer who can query.
    expect(getEventMock).not.toHaveBeenCalled();
    expect(listMyEventMembershipsMock).not.toHaveBeenCalled();
  });

  it('a doc id resolves even when the slug query finds nothing', async () => {
    getDocsMock.mockResolvedValue(emptyQuery());
    getEventMock.mockResolvedValue(EVENT);

    expect((await getEventBySlugOrId('evt-1', UID))?.id).toBe(EVENT.id);
    expect(getEventMock).toHaveBeenCalledWith('evt-1');
  });

  it('MEMBER + slug: falls back to membership-scoped resolution when BOTH reads are denied', async () => {
    // Exactly the production failure: the slug query is denied, and the getDoc on the slug
    // string is denied too (that doc id does not exist and they are not a member of it).
    getDocsMock.mockRejectedValue(denied());
    getEventMock.mockImplementation((id: string) =>
      id === 'alpha-festival' ? Promise.reject(denied()) : Promise.resolve(EVENT),
    );
    listMyEventMembershipsMock.mockResolvedValue([{ eventId: 'evt-1', role: 'tech' }]);

    const found = await getEventBySlugOrId('alpha-festival', UID);

    expect(found?.id).toBe(EVENT.id);
    expect(listMyEventMembershipsMock).toHaveBeenCalledWith(UID);
  });

  it('a denied viewer whose memberships do not match the slug gets null, not a throw', async () => {
    getDocsMock.mockRejectedValue(denied());
    getEventMock.mockImplementation((id: string) =>
      id === 'someone-elses-show'
        ? Promise.reject(denied())
        : Promise.resolve({ ...EVENT, slug: 'not-the-one' }),
    );
    listMyEventMembershipsMock.mockResolvedValue([{ eventId: 'evt-1', role: 'tech' }]);

    // null renders "Event not found, or you don't have access" — the honest outcome. Throwing
    // renders "Failed to load this event.", which is what the bug did.
    await expect(getEventBySlugOrId('someone-elses-show', UID)).resolves.toBeNull();
  });

  it('oversight viewer with a genuinely unknown slug skips the membership fan-out', async () => {
    // The slug query SUCCEEDED and matched nothing, so it already spoke for every event.
    getDocsMock.mockResolvedValue(emptyQuery());
    getEventMock.mockResolvedValue(null);

    await expect(getEventBySlugOrId('no-such-show', UID)).resolves.toBeNull();
    expect(listMyEventMembershipsMock).not.toHaveBeenCalled();
  });

  it('propagates a NON-permission error instead of reporting "no such event"', async () => {
    // An outage must not be laundered into a 404 — that is how a real failure hides.
    getDocsMock.mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));

    await expect(getEventBySlugOrId('alpha-festival', UID)).rejects.toThrow('offline');
    expect(listMyEventMembershipsMock).not.toHaveBeenCalled();
  });
});
