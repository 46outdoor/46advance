/**
 * Chunked Firestore batch writer.
 *
 * Firestore caps a WriteBatch at 500 operations. Seeds (create-from-template) and cleanups
 * (deleteUser clearing every membership) can exceed that for a large template or a heavily-
 * membered user — the single `batch.commit()` then throws, leaving the operation partially
 * applied. ChunkedBatch accumulates writes and flushes them in <=chunkSize-op batches on
 * commit(), so the op count is bounded regardless of input size.
 *
 * NOT atomic across chunks (Firestore offers no transaction at this scale). Callers that need
 * all-or-nothing must design for partial-failure recovery; this only removes the hard cap.
 */
import type {
  DocumentData,
  DocumentReference,
  Firestore,
  SetOptions,
  WriteBatch,
} from 'firebase-admin/firestore';

/** The subset of WriteBatch our seeders/cleanups use — satisfied by WriteBatch and ChunkedBatch. */
export interface BatchLike {
  set(ref: DocumentReference, data: DocumentData, options?: SetOptions): unknown;
  delete(ref: DocumentReference): unknown;
}

/** Under Firestore's 500-writes-per-batch cap, with headroom. */
const DEFAULT_CHUNK = 400;

export class ChunkedBatch implements BatchLike {
  private readonly ops: Array<(b: WriteBatch) => void> = [];

  constructor(
    private readonly db: Firestore,
    private readonly chunkSize: number = DEFAULT_CHUNK,
  ) {}

  set(ref: DocumentReference, data: DocumentData, options?: SetOptions): this {
    this.ops.push(options ? (b) => void b.set(ref, data, options) : (b) => void b.set(ref, data));
    return this;
  }

  delete(ref: DocumentReference): this {
    this.ops.push((b) => void b.delete(ref));
    return this;
  }

  /** Queued operation count (for logging/tests). */
  get size(): number {
    return this.ops.length;
  }

  /** Flush all queued writes in <=chunkSize-op batches. */
  async commit(): Promise<void> {
    for (let i = 0; i < this.ops.length; i += this.chunkSize) {
      const batch = this.db.batch();
      for (const op of this.ops.slice(i, i + this.chunkSize)) op(batch);
      await batch.commit();
    }
  }
}
