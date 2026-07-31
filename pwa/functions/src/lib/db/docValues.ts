/**
 * Coercion helpers for raw Firestore reads. Admin-SDK `DocumentData` is untyped, so callers
 * that walk a document need the same guard: treat a missing or wrong-typed field as its empty
 * value rather than trusting the stored shape.
 */

/** A stored array field, or `[]` for anything that isn't one (missing, scalar, object). */
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
