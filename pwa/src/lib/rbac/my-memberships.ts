/**
 * Cross-event membership summary — "which events am I on, and as what?".
 *
 * Distinct from `membership.ts`, which answers "what is my role on THIS event". This module
 * owns the single self-only `collectionGroup('members').where('uid','==',uid)` read, which
 * the top-level `/{path=**}/members/{memberUid}` rule keeps scoped to the caller's own rows.
 *
 * It exists because several surfaces (AppShell's Tracker gate, the Events list, the Tracker
 * overview, the Calendar Feed picker) all need it. Before this module the events list and the
 * tracker each ran that query themselves and threw the `role` away, keeping only the parent
 * event id — so "am I a PM anywhere?" could not be answered without a third copy. Keep the
 * role: it is the whole reason this is a shared read.
 *
 * Pair it with `useMyEventMemberships()` so the callers share one React Query entry.
 */
import { collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { createLogger } from '@/lib/logger';
import { eventRoleSchema, type EventRole } from './roles';

const logger = createLogger('MyMemberships');

/** One event the caller belongs to, with the role they hold there. */
export interface MyEventMembership {
  eventId: string;
  role: EventRole;
}

/**
 * React Query key for the caller's cross-event membership summary. Keyed on uid so an account
 * switch can never serve the previous identity's memberships.
 */
export const myEventMembershipsKey = (uid: string | undefined) =>
  ['rbac', 'my-memberships', uid ?? null] as const;

/**
 * Every event the user is a member of, with their role. Self-only by construction — the
 * collection-group rule denies any other `uid` filter, so this cannot enumerate other people.
 *
 * Rows are skipped (not thrown on) when the event id or role can't be resolved: this read
 * gates navigation and the events list, so one malformed member document must not blank the
 * app. Only the `role` is validated here — callers that need the full member document read it
 * per-event through `membership.ts`.
 */
export async function listMyEventMemberships(uid: string): Promise<MyEventMembership[]> {
  const snap = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)));

  // Doc ids are uids, so one row per event is the norm; the map is a cheap guarantee that a
  // stray duplicate can't fan out into duplicate event reads downstream.
  const byEvent = new Map<string, MyEventMembership>();
  for (const d of snap.docs) {
    const eventId = d.ref.parent.parent?.id;
    if (!eventId || byEvent.has(eventId)) continue;
    const role = eventRoleSchema.safeParse((d.data() as { role?: unknown }).role);
    if (!role.success) {
      logger.warn(`Skipping membership on ${eventId}: unrecognized role`, d.data());
      continue;
    }
    byEvent.set(eventId, { eventId, role: role.data });
  }
  return [...byEvent.values()];
}

/** The events where the caller is the production manager (Tracker's membership scope). */
export function productionManagerEventIds(
  memberships: readonly MyEventMembership[],
): string[] {
  return memberships.filter((m) => m.role === 'production-manager').map((m) => m.eventId);
}

/**
 * Tri-state "is this user a PM on at least one event", shaped for `canViewTracker`.
 *
 * `undefined` in means `undefined` out: the summary is resolved asynchronously, and treating
 * "not known yet" as `false` would render the Tracker link hidden → visible (or visible →
 * hidden) as the query settles.
 */
export function isProductionManagerSomewhere(
  memberships: readonly MyEventMembership[] | undefined,
): boolean | undefined {
  return memberships?.some((m) => m.role === 'production-manager');
}
