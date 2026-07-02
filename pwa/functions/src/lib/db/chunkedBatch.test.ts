import { describe, it, expect } from 'vitest';
import type { DocumentData, DocumentReference, Firestore } from 'firebase-admin/firestore';
import { ChunkedBatch } from './chunkedBatch';

/** Fake Firestore recording the op-count of each committed batch. */
function makeFakeDb() {
  const committed: number[] = [];
  const db = {
    batch() {
      let ops = 0;
      return {
        set() {
          ops++;
          return this;
        },
        delete() {
          ops++;
          return this;
        },
        async commit() {
          committed.push(ops);
        },
      };
    },
  } as unknown as Firestore;
  return { db, committed };
}

const ref = {} as DocumentReference;
const data = {} as DocumentData;

describe('ChunkedBatch', () => {
  it('flushes all ops in <= chunkSize batches', async () => {
    const { db, committed } = makeFakeDb();
    const cb = new ChunkedBatch(db, 3);
    for (let i = 0; i < 7; i++) cb.set(ref, data);
    expect(cb.size).toBe(7);
    await cb.commit();
    expect(committed).toEqual([3, 3, 1]); // 7 ops → 3 + 3 + 1
  });

  it('commits nothing when empty', async () => {
    const { db, committed } = makeFakeDb();
    await new ChunkedBatch(db, 400).commit();
    expect(committed).toEqual([]);
  });

  it('handles mixed set/delete in order', async () => {
    const { db, committed } = makeFakeDb();
    const cb = new ChunkedBatch(db, 2);
    cb.set(ref, data);
    cb.delete(ref);
    cb.set(ref, data);
    await cb.commit();
    expect(committed).toEqual([2, 1]);
  });
});
