/**
 * The crew roster read (planning/ACCESS_SCOPING_PLAN.md §4.2).
 *
 * The behaviour under test is what makes the rules change survivable: resolving a roster must
 * touch ONLY the event's own subcollection. It used to `Promise.all` the attachments with
 * `listContacts()` — a read of the global directory — which a crew member will not be allowed
 * to make. The "no directory read" case below fails against that implementation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';

const getDocs = vi.hoisted(() => vi.fn());
const listContacts = vi.hoisted(() => vi.fn());

vi.mock('@/services/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (...path: unknown[]) => ({ path }),
  doc: (...path: unknown[]) => ({ path }),
  getDocs,
  addDoc: vi.fn(async () => ({ id: 'attach-new' })),
  updateDoc: vi.fn(),
  serverTimestamp: () => 'server-time',
}));
vi.mock('@/lib/contacts/contacts-service', () => ({ listContacts }));

import { attachContact, crewContactSnapshot, listEventContacts } from './event-contacts-service';
import { addDoc } from 'firebase/firestore';

/** A Firestore-shaped query snapshot over the attachment docs. */
function snapshotOf(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
}

const SNAPSHOT = {
  name: 'Dana Reyes',
  role: 'Audio',
  company: 'Deep South',
  phone: '555-0100',
  email: 'dana@example.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  listContacts.mockResolvedValue([]);
});

describe('listEventContacts', () => {
  it('resolves crew from the attachment copies WITHOUT reading the global directory', async () => {
    getDocs.mockResolvedValue(
      snapshotOf([
        { id: 'attach-1', data: { contactId: 'contact-1', roleLabel: 'FOH', contact: SNAPSHOT } },
      ]),
    );

    const [crew] = await listEventContacts('event-1');

    expect(crew.contact).toEqual(SNAPSHOT);
    expect(crew.attachment).toMatchObject({ id: 'attach-1', contactId: 'contact-1' });
    // The point of the whole change: one read, and it is not the directory.
    expect(listContacts).not.toHaveBeenCalled();
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('keeps the name of a crew member whose directory entry was deleted, and flags it', async () => {
    // Blanking the roster when a contact is deleted would lose who was actually on the show.
    getDocs.mockResolvedValue(
      snapshotOf([
        {
          id: 'attach-1',
          data: {
            contactId: 'gone',
            contact: SNAPSHOT,
            contactDeletedAt: Timestamp.fromDate(new Date('2026-09-01T00:00:00Z')),
          },
        },
      ]),
    );

    const [crew] = await listEventContacts('event-1');

    expect(crew.contact?.name).toBe('Dana Reyes');
    expect(crew.attachment.contactDeletedAt).toEqual(new Date('2026-09-01T00:00:00Z'));
  });

  it('tolerates a legacy attachment with no snapshot rather than throwing', async () => {
    // Rows written before the snapshot existed, until the backfill reaches them. A parse error
    // here would take down the whole Crew panel for one unmigrated row.
    getDocs.mockResolvedValue(
      snapshotOf([{ id: 'attach-1', data: { contactId: 'contact-1', roleLabel: 'FOH' } }]),
    );

    const [crew] = await listEventContacts('event-1');

    expect(crew.contact).toBeNull();
    expect(crew.attachment.contactDeletedAt).toBeNull();
  });

  it('sorts by the copied name, with unsnapshotted rows first under an empty name', async () => {
    getDocs.mockResolvedValue(
      snapshotOf([
        { id: 'b', data: { contactId: 'c2', contact: { ...SNAPSHOT, name: 'Zoe Adams' } } },
        { id: 'a', data: { contactId: 'c1', contact: { ...SNAPSHOT, name: 'Alex Kim' } } },
        { id: 'x', data: { contactId: 'c3' } },
      ]),
    );

    const names = (await listEventContacts('event-1')).map((c) => c.contact?.name ?? null);

    expect(names).toEqual([null, 'Alex Kim', 'Zoe Adams']);
  });
});

describe('attachContact', () => {
  it('writes the display snapshot alongside the join, so members need no directory access', async () => {
    await attachContact('event-1', { id: 'contact-1', ...SNAPSHOT }, '  Stage Manager  ', 'user-1');

    const payload = vi.mocked(addDoc).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      contactId: 'contact-1',
      contact: SNAPSHOT,
      contactDeletedAt: null,
      roleLabel: 'Stage Manager',
      addedBy: 'user-1',
    });
  });

  it('does NOT copy userId — that is authorization data and stays server-owned', () => {
    // crewLogistics gates room numbers on a denormalized userId maintained by the server. A
    // client-written copy of it here would be a second, unowned source of the same authority.
    const snapshot = crewContactSnapshot({
      name: 'Dana Reyes',
      role: null,
      company: null,
      phone: null,
      email: null,
    });

    expect(Object.keys(snapshot).sort()).toEqual(['company', 'email', 'name', 'phone', 'role']);
  });
});
