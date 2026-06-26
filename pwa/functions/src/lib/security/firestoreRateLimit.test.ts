import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
// No extension specifier: excluded from the nodenext tsc build; Vitest resolves the .ts.
import { checkFirestoreRateLimit, enforceRateLimit } from './firestoreRateLimit';

interface Ref {
  id: string;
}
interface FakeTx {
  get: (ref: Ref) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
  set: (ref: Ref, data: Record<string, unknown>) => void;
  update: (ref: Ref, partial: Record<string, unknown>) => void;
}

/** Minimal in-memory Firestore double — implements only what the limiter uses. */
function fakeDb(): Firestore {
  const store = new Map<string, Record<string, unknown>>();
  const db = {
    collection: () => ({ doc: (id: string): Ref => ({ id }) }),
    runTransaction: async <T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> => {
      const tx: FakeTx = {
        get: async (ref: Ref) => {
          const data = store.get(ref.id);
          return { exists: data !== undefined, data: () => data };
        },
        set: (ref: Ref, data: Record<string, unknown>) => {
          store.set(ref.id, { ...data });
        },
        update: (ref: Ref, partial: Record<string, unknown>) => {
          store.set(ref.id, { ...(store.get(ref.id) ?? {}), ...partial });
        },
      };
      return fn(tx);
    },
  };
  return db as unknown as Firestore;
}

describe('checkFirestoreRateLimit', () => {
  it('allows up to the limit, then blocks within the window', async () => {
    const db = fakeDb();
    const key = 'generatePacket:uid-1';
    expect(await checkFirestoreRateLimit(db, key, 3, 60_000)).toMatchObject({ allowed: true, remaining: 2 });
    expect(await checkFirestoreRateLimit(db, key, 3, 60_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(await checkFirestoreRateLimit(db, key, 3, 60_000)).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = await checkFirestoreRateLimit(db, key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('isolates limits per key', async () => {
    const db = fakeDb();
    expect((await checkFirestoreRateLimit(db, 'a:1', 1, 60_000)).allowed).toBe(true);
    expect((await checkFirestoreRateLimit(db, 'a:1', 1, 60_000)).allowed).toBe(false);
    expect((await checkFirestoreRateLimit(db, 'b:1', 1, 60_000)).allowed).toBe(true); // distinct key
  });
});

describe('enforceRateLimit', () => {
  it('resolves while under the limit', async () => {
    const db = fakeDb();
    await expect(enforceRateLimit(db, ['fn', 'uid'], 2)).resolves.toBeUndefined();
    await expect(enforceRateLimit(db, ['fn', 'uid'], 2)).resolves.toBeUndefined();
  });

  it('throws a resource-exhausted HttpsError when exceeded', async () => {
    const db = fakeDb();
    await enforceRateLimit(db, ['fn', 'uid'], 1);
    await expect(enforceRateLimit(db, ['fn', 'uid'], 1)).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('builds the key from parts, dropping a null uid', async () => {
    const db = fakeDb();
    // ['fn', null] → key 'fn'; the follow-up ['fn'] hits the same key and trips the limit.
    await enforceRateLimit(db, ['fn', null], 1);
    await expect(enforceRateLimit(db, ['fn'], 1)).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});
