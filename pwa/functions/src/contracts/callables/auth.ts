/**
 * Callable contract schemas — auth domain (syncUserClaims, setUserApproved,
 * setUserOrganizer). Single source of truth shared by the Functions handlers
 * (runtime `.parse`) and the web/mobile clients (inferred In/Out types).
 *
 * Pure Zod — no firebase imports — so it compiles under both the Functions
 * (nodenext/CJS) and the PWA (bundler/ESM) toolchains. Import via the `@contracts`
 * alias on the client; via a relative `./contracts/...js` path in Functions.
 */
import { z } from 'zod';

// syncUserClaims — no input (reads the auth context); returns the claim summary.
export const syncUserClaimsOutputSchema = z.object({
  isAdmin: z.boolean(),
  isOrganizer: z.boolean(),
  approved: z.boolean(),
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
