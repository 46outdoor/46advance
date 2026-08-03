/**
 * Callable contract schemas — per-event membership (assignEventMember / removeEventMember).
 * Lets an event production manager (or admin) manage `events/{id}/members/{uid}` without the
 * global-admin Firestore rules gate: the callables run on the Admin SDK and re-assert the
 * PM-or-admin check server-side. Pure Zod — see ./auth.ts header.
 *
 * The role enum mirrors EVENT_ROLES in the client's src/lib/rbac/roles.ts (contracts stay
 * dependency-free of client code, same as the status enums in ./events.ts).
 */
import { z } from 'zod';

export const eventRoleWireSchema = z.enum(['production-manager', 'department-lead', 'tech']);
export type EventRoleWire = z.infer<typeof eventRoleWireSchema>;

/**
 * Assign (or update) a member. Target is EITHER an email (Team panel add-by-email; the server
 * resolves it to an account) OR a uid (role edits on the roster; the Crew panel's tech
 * auto-enroll, which knows the linked user id).
 *
 * `departments` is only meaningful for `department-lead`: the section keys (department ids)
 * that member may edit on advances + stage production records. Ignored for other roles.
 *
 * `ifAbsent` makes the call a no-op when ANY membership already exists — used by the Crew
 * auto-enroll so attaching a contact never downgrades an existing PM/dept-lead to tech.
 */
export const assignEventMemberInputSchema = z
  .object({
    eventId: z.string().min(1),
    email: z.string().trim().email().optional(),
    uid: z.string().min(1).optional(),
    role: eventRoleWireSchema,
    departments: z.array(z.string().min(1)).max(50).optional(),
    ifAbsent: z.boolean().optional(),
  })
  .refine((d) => (d.email ? !d.uid : !!d.uid), {
    message: 'Provide exactly one of email or uid.',
  });
export type AssignEventMemberInput = z.infer<typeof assignEventMemberInputSchema>;

export const assignEventMemberOutputSchema = z.object({
  uid: z.string().min(1),
  /** The role now in effect (the existing one when `ifAbsent` skipped the write). */
  role: eventRoleWireSchema,
  /** False when `ifAbsent` found an existing membership and left it untouched. */
  updated: z.boolean(),
});
export type AssignEventMemberOutput = z.infer<typeof assignEventMemberOutputSchema>;

export const removeEventMemberInputSchema = z.object({
  eventId: z.string().min(1),
  uid: z.string().min(1),
});
export type RemoveEventMemberInput = z.infer<typeof removeEventMemberInputSchema>;

export const removeEventMemberOutputSchema = z.object({
  /** False when there was no membership to remove (idempotent retry). */
  removed: z.boolean(),
});
export type RemoveEventMemberOutput = z.infer<typeof removeEventMemberOutputSchema>;
