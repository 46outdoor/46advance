/**
 * Callable contract schemas — crew travel & lodging lifecycle
 * (planning/CREW_TRAVEL_LODGING_PLAN.md §4.2). Pure Zod — see ./auth.ts header.
 *
 * Two callables exist because two client-reachable writes became server-owned when
 * `crewLogistics.userId` became denormalized authorization data:
 * - `detachEventContact` replaces the direct roster-attachment delete: rules cannot query for
 *   dependent logistics records, so the detach must be refused server-side while any exist.
 * - `relinkContactUser` replaces the admin's direct `contacts/{id}.userId` rewrite: a
 *   one-write client relink would leave every denormalized copy authorizing the wrong
 *   account, so the relink updates contact + user pointers + all copies in one transaction.
 */
import { z } from 'zod';

export const detachEventContactInputSchema = z.object({
  eventId: z.string().min(1),
  attachId: z.string().min(1),
});
export type DetachEventContactInput = z.infer<typeof detachEventContactInputSchema>;

export const detachEventContactOutputSchema = z.object({
  eventId: z.string(),
  attachId: z.string(),
  detached: z.literal(true),
});
export type DetachEventContactOutput = z.infer<typeof detachEventContactOutputSchema>;

/** `uid: null` unlinks the contact; a string links it to that account (A→B in one call). */
export const relinkContactUserInputSchema = z.object({
  contactId: z.string().min(1),
  uid: z.string().min(1).nullable(),
});
export type RelinkContactUserInput = z.infer<typeof relinkContactUserInputSchema>;

export const relinkContactUserOutputSchema = z.object({
  contactId: z.string(),
  uid: z.string().nullable(),
  /** How many crewLogistics records had their denormalized userId rewritten in the txn. */
  reconciledRecords: z.number().int().nonnegative(),
});
export type RelinkContactUserOutput = z.infer<typeof relinkContactUserOutputSchema>;
