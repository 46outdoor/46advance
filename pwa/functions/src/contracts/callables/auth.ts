/**
 * Callable contract schemas — auth domain (syncUserClaims, setUserApproved,
 * setUserOrganizer). Single source of truth shared by the Functions handlers
 * (runtime `.parse`) and the web/mobile clients (inferred In/Out types).
 *
 * Pure Zod — no firebase imports — so it compiles under both the Functions
 * (nodenext/CJS) and the PWA (bundler/ESM) toolchains. Import via the `@contracts`
 * alias on the client; via a relative `./contracts/...js` path in Functions.
 *
 * ⚠ OPTIONAL FIELDS MUST BE `.nullish()`, NOT `.optional()`, if a client can ever pass the
 * value as `undefined`. The Firebase callable client encodes with `if (data == null) return
 * null` — loose equality — so a property explicitly set to `undefined` arrives as `null`, and
 * `.optional()` rejects `null` with `invalid-argument` (HTTP 400). This silently broke
 * `generatePacket` for a week. Either omit the key entirely on the client (`...(v !== undefined
 * && { v })`) or accept `.nullish()` here; prefer both. Handlers reading the value with `??`
 * need no change, since `??` treats null and undefined alike.
 */
import { z } from 'zod';

// syncUserClaims — optional `displayName` (the name the user entered at registration; the client
// also sets it on the Auth profile). Used as the name hint for the users/{uid} profile without
// clobbering an admin-set name. Returns the claim summary. `emailVerified` mirrors the token's
// email_verified: no `admin`/`approved` claim is granted until verified, so the client can gate.
export const syncUserClaimsInputSchema = z.object({
  displayName: z.string().nullable().optional(),
});
export type SyncUserClaimsInput = z.infer<typeof syncUserClaimsInputSchema>;

// ⚠ `isProductionDirector` carries `.default(false)` so the inferred type stays a required
// boolean while an older Functions response (pre-rollout, or after a Functions rollback)
// still satisfies the schema. The default only fires under `.parse()`, and the CLIENT NEVER
// PARSES CALLABLE OUTPUT — it uses these types as generics and returns `result.data` raw.
// So the client must normalize the field itself (see AuthProvider.applyClaims); do not rely
// on this default to protect the browser.
export const syncUserClaimsOutputSchema = z.object({
  isAdmin: z.boolean(),
  isOrganizer: z.boolean(),
  isProductionDirector: z.boolean().default(false),
  // Same legacy-response caveat as isProductionDirector above: the client normalizes.
  isProductionCoordinator: z.boolean().default(false),
  approved: z.boolean(),
  emailVerified: z.boolean(),
});
export type SyncUserClaimsOutput = z.infer<typeof syncUserClaimsOutputSchema>;

// setUserApproved — admin grants/revokes a user's access; echoes the decision.
export const setUserApprovedInputSchema = z.object({
  uid: z.string().min(1),
  approved: z.boolean(),
});
export type SetUserApprovedInput = z.infer<typeof setUserApprovedInputSchema>;
export const setUserApprovedOutputSchema = setUserApprovedInputSchema;
export type SetUserApprovedOutput = z.infer<typeof setUserApprovedOutputSchema>;

// setUserOrganizer — admin grants/revokes the global organizer capability.
export const setUserOrganizerInputSchema = z.object({
  uid: z.string().min(1),
  organizer: z.boolean(),
});
export type SetUserOrganizerInput = z.infer<typeof setUserOrganizerInputSchema>;
export const setUserOrganizerOutputSchema = setUserOrganizerInputSchema;
export type SetUserOrganizerOutput = z.infer<typeof setUserOrganizerOutputSchema>;

// setUserProductionDirector — admin grants/revokes the global production-director capability
// (read-only oversight of EVERY event, whether or not the user is a member). Deliberately
// separate from `organizer`: that toggle means "may create events", and silently widening it
// to "may read every event" would make the Admin label lie at the moment someone grants it.
export const setUserProductionDirectorInputSchema = z.object({
  uid: z.string().min(1),
  productionDirector: z.boolean(),
});
export type SetUserProductionDirectorInput = z.infer<typeof setUserProductionDirectorInputSchema>;
export const setUserProductionDirectorOutputSchema = setUserProductionDirectorInputSchema;
export type SetUserProductionDirectorOutput = z.infer<typeof setUserProductionDirectorOutputSchema>;

// setUserProductionCoordinator — admin grants/revokes the global production-coordinator
// capability (CREW_TRAVEL_LODGING_PLAN.md Phase 2): the same cross-event READ population as
// the director (§2.1 #2, resolved 2026-08-21), plus four narrow writes — crew logistics,
// the crew roster, the contacts directory, and schedule days. It never widens
// canEditEvent/assertCanEditEvent: advances, production records, packets, checklists, and
// quotes stay PM/admin.
export const setUserProductionCoordinatorInputSchema = z.object({
  uid: z.string().min(1),
  productionCoordinator: z.boolean(),
});
export type SetUserProductionCoordinatorInput = z.infer<
  typeof setUserProductionCoordinatorInputSchema
>;
export const setUserProductionCoordinatorOutputSchema = setUserProductionCoordinatorInputSchema;
export type SetUserProductionCoordinatorOutput = z.infer<
  typeof setUserProductionCoordinatorOutputSchema
>;

// setUserDisplayName — admin sets a user's display name (shown in pickers/member lists).
// An empty string clears it (falls back to email). Echoes the stored value (null when cleared).
export const setUserDisplayNameInputSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().trim().max(120),
});
export type SetUserDisplayNameInput = z.infer<typeof setUserDisplayNameInputSchema>;
export const setUserDisplayNameOutputSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().nullable(),
});
export type SetUserDisplayNameOutput = z.infer<typeof setUserDisplayNameOutputSchema>;

// deleteUser — admin permanently removes an account (Auth + users doc). The person's
// contact is kept (unlinked) as reference data, and their event memberships are cleared.
export const deleteUserInputSchema = z.object({ uid: z.string().min(1) });
export type DeleteUserInput = z.infer<typeof deleteUserInputSchema>;
export const deleteUserOutputSchema = z.object({ uid: z.string().min(1), deleted: z.boolean() });
export type DeleteUserOutput = z.infer<typeof deleteUserOutputSchema>;
