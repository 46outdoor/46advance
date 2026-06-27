import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDoc, type DocumentSnapshot } from 'firebase/firestore';
import { getEventMember, getEventRole } from './membership';

// Mock the Firestore app handle so no real Firebase is initialized.
vi.mock('@/services/firebase', () => ({ db: {} }));

// Keep the real `firebase/firestore` (so `Timestamp` etc. stay intact for the
// schema in roles.ts); only stub the IO entry points membership.ts uses.
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return { ...actual, doc: vi.fn(), getDoc: vi.fn() };
});

const mockGetDoc = vi.mocked(getDoc);

function memberSnapshot(data: Record<string, unknown> | undefined): DocumentSnapshot {
  return {
    exists: () => data !== undefined,
    data: () => data,
  } as unknown as DocumentSnapshot;
}

describe('rbac/membership IO', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
  });

  it('getEventMember parses an existing membership doc', async () => {
    mockGetDoc.mockResolvedValue(
      memberSnapshot({ role: 'tech', addedBy: 'admin-uid', addedAt: null }),
    );

    const member = await getEventMember('user-1', 'event-1');

    expect(member).not.toBeNull();
    expect(member?.role).toBe('tech');
    expect(member?.addedBy).toBe('admin-uid');
    expect(member?.addedAt).toBeNull();
  });

  it('getEventMember returns null when the user is not a member', async () => {
    mockGetDoc.mockResolvedValue(memberSnapshot(undefined));

    expect(await getEventMember('user-1', 'event-1')).toBeNull();
  });

  it('getEventRole resolves the per-event role of a member', async () => {
    mockGetDoc.mockResolvedValue(
      memberSnapshot({ role: 'production-manager', addedBy: 'admin-uid', addedAt: null }),
    );

    expect(await getEventRole('user-1', 'event-1')).toBe('production-manager');
  });

  it('getEventRole returns null when the user has no role on the event', async () => {
    mockGetDoc.mockResolvedValue(memberSnapshot(undefined));

    expect(await getEventRole('user-1', 'event-1')).toBeNull();
  });
});
