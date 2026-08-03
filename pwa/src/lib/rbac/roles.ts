/**
 * Canonical RBAC role definitions (see AGENTS.md § Shared surface → "Auth custom
 * claims / RBAC roles"). All role types + their Zod schemas live here; every
 * permission check imports from this file. Do not redefine roles elsewhere.
 *
 * Two tiers:
 * - **Global admin** = Firebase custom claim `admin: true` (not a per-event role).
 * - **Per-event role** = `events/{eventId}/members/{uid}.role` (one of EVENT_ROLES).
 *
 * Capability matrix is encoded in `permissions.ts`:
 *   admin (global)      → view + edit + flag + manage members (any event)
 *   production-manager  → view + edit + flag + manage members (their event)
 *   department-lead     → view + flag/comment; edits the advance/stage-production sections
 *                         of their ASSIGNED departments (`departments` below) — read-only
 *                         elsewhere and read-only everywhere when none are assigned
 *   tech                → view only
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';

/** Per-event roles, ordered most → least privileged. */
export const EVENT_ROLES = ['production-manager', 'department-lead', 'tech'] as const;

export type EventRole = (typeof EVENT_ROLES)[number];

export const eventRoleSchema = z.enum(EVENT_ROLES);

/** Human-readable labels for the per-event roles (UI display). */
export const EVENT_ROLE_LABELS: Record<EventRole, string> = {
  'production-manager': 'Production Manager',
  'department-lead': 'Department Lead',
  tech: 'Tech',
};

/** Format a per-event role for display (e.g. `production-manager` → `Production Manager`). */
export function formatEventRole(role: EventRole): string {
  return EVENT_ROLE_LABELS[role];
}

/**
 * Member document shape: `events/{eventId}/members/{uid}`.
 * `addedAt` is a server timestamp on write; converted to `Date` on read.
 */
export interface EventMember {
  role: EventRole;
  addedBy: string;
  addedAt: Date | null;
  /** Department ids a `department-lead` may edit (advance + stage-production sections). */
  departments: string[];
  /** Denormalized account email/name for the Team roster (non-admin PMs can't read the
   *  users directory). Null on rows written before this feature. */
  email: string | null;
  displayName: string | null;
}

/** Validated input for assigning/updating a member (the client-supplied fields). */
export const eventMemberInputSchema = z.object({ role: eventRoleSchema });

/** Raw Firestore member doc (timestamps still as `Timestamp`). */
const eventMemberDocSchema = z.object({
  role: eventRoleSchema,
  addedBy: z.string().min(1),
  addedAt: z.instanceof(Timestamp).nullable().optional(),
  departments: z.array(z.string()).optional(),
  email: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
});

/**
 * Validate + normalize a raw `members/{uid}` document into an `EventMember`.
 * Throws (ZodError) if the doc shape is invalid.
 */
export function parseEventMember(data: unknown): EventMember {
  const doc = eventMemberDocSchema.parse(data);
  return {
    role: doc.role,
    addedBy: doc.addedBy,
    addedAt: timestampToDate(doc.addedAt ?? null),
    departments: doc.departments ?? [],
    email: doc.email ?? null,
    displayName: doc.displayName ?? null,
  };
}
