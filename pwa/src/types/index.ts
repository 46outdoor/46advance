/**
 * Canonical TypeScript definitions live here (see AGENTS.md § Code Discovery).
 * Domain types (events, advances, roles, etc.) are added in Phase 1+.
 */

/** Discriminated result type for operations that can fail. */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
