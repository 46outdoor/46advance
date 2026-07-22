/**
 * Event URL slug helpers (server copy; mirrors the client `src/lib/events/slug.ts`).
 * The client computes the desired slug from the booking label/name + year and sends it;
 * the server defensively re-slugifies and reserves it TRANSACTIONALLY (WS-G).
 *
 * Uniqueness is enforced by a canonical `slugs/{slug}` reservation collection (doc id =
 * the slug, body `{ eventId }`) — not by scanning the events collection. Claiming a slug
 * is a single-doc transactional read+create, so two concurrent creates can never both take
 * the same slug (the old best-effort scan read uniqueness OUTSIDE any transaction). The
 * reservation is server-only (firestore.rules locks `slugs/{slug}`); the Admin SDK here is
 * the sole writer.
 */
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

/** URL-safe slug: lowercase, fold accents, non-alphanumerics → single hyphens, trimmed. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Candidate slugs in preference order: the base first (when non-empty), then `-2`, `-3`, …
 *  — the same numbering the old `uniqueSlug` used, so migrated data keeps its shape. An
 *  empty base falls back to the stem `event` (`event-2`, `event-3`, …), so a slug is never
 *  the empty string (an invalid Firestore doc id). */
export function* slugCandidates(base: string): Generator<string> {
  const stem = base || 'event';
  if (base) yield base;
  for (let i = 2; ; i += 1) yield `${stem}-${i}`;
}

/** Absolute ceiling on collision probing — 100 events sharing one base is unreachable in
 *  practice, so hitting it means a bug (or abuse), not a legitimate slug. */
const MAX_SLUG_ATTEMPTS = 100;

/**
 * Find the first free slug for `eventId`, READ-ONLY (all `tx.get`s, no writes) so it can be
 * composed inside a larger transaction that reads other docs first. Returns the chosen slug
 * and the reservation ref to claim — or `claimRef: null` when the slug is already reserved by
 * THIS event (an idempotent create retry, or a rename to the current slug). Callers do the
 * `tx.set(claimRef, …)` after their own reads, preserving the reads-before-writes rule.
 */
export async function findFreeSlug(
  tx: Transaction,
  db: Firestore,
  base: string,
  eventId: string,
): Promise<{ slug: string; claimRef: DocumentReference | null }> {
  let attempts = 0;
  for (const candidate of slugCandidates(base)) {
    if (++attempts > MAX_SLUG_ATTEMPTS) break;
    const ref = db.collection('slugs').doc(candidate);
    const snap = await tx.get(ref);
    if (!snap.exists) return { slug: candidate, claimRef: ref };
    if (snap.get('eventId') === eventId) return { slug: candidate, claimRef: null };
  }
  throw new Error('Could not allocate a unique event slug.');
}

/**
 * Transactionally reserve a unique slug for `eventId` and return it. Idempotent: a slug
 * already owned by this event is returned unchanged (no duplicate reservation). Use from the
 * create paths, which don't need to release a previous slug; rename uses `findFreeSlug`
 * directly inside its own transaction so the claim + release commit together.
 */
export async function reserveEventSlug(db: Firestore, desired: string, eventId: string): Promise<string> {
  const base = slugify(desired);
  return db.runTransaction(async (tx) => {
    const { slug, claimRef } = await findFreeSlug(tx, db, base, eventId);
    if (claimRef) tx.set(claimRef, { eventId, createdAt: FieldValue.serverTimestamp() });
    return slug;
  });
}
