/**
 * Callable contract schemas — Google Drive domain (getDriveAccessToken,
 * linkDriveFile, removeDriveFile, savePacketToDrive). Pure Zod — see ./auth.ts header.
 */
import { z } from 'zod';

// getDriveAccessToken — no input; returns a short-lived Picker token.
export const getDriveAccessTokenOutputSchema = z.object({ accessToken: z.string().min(1) });
export type GetDriveAccessTokenOutput = z.infer<typeof getDriveAccessTokenOutputSchema>;

// link/removeDriveFile share the advance-ref + fileId input and a { ok } result.
const advanceFileRefSchema = z.object({
  eventId: z.string().min(1),
  stageId: z.string().min(1),
  advanceId: z.string().min(1),
  fileId: z.string().min(1),
});
export const linkDriveFileInputSchema = advanceFileRefSchema;
export type LinkDriveFileInput = z.infer<typeof linkDriveFileInputSchema>;
export const removeDriveFileInputSchema = advanceFileRefSchema;
export type RemoveDriveFileInput = z.infer<typeof removeDriveFileInputSchema>;
export const driveOkOutputSchema = z.object({ ok: z.boolean() });
export type DriveOkOutput = z.infer<typeof driveOkOutputSchema>;

// savePacketToDrive — copies a generated packet into the caller's Drive.
export const savePacketToDriveInputSchema = z.object({
  eventId: z.string().min(1),
  path: z.string().min(1),
});
export type SavePacketToDriveInput = z.infer<typeof savePacketToDriveInputSchema>;
export const savePacketToDriveOutputSchema = z.object({
  saved: z.boolean(),
  reason: z.string().nullable().optional(),
  webViewLink: z.string().nullable().optional(),
  fileId: z.string().nullable().optional(),
});
export type SavePacketToDriveOutput = z.infer<typeof savePacketToDriveOutputSchema>;

// importDriveFolder — mirror the admin-configured library root (per-artist subfolders) into the
// library, on demand. Enumerated by the docs-broker service account, so no user Drive scope is
// involved. `folderId` is legacy: older clients sent a Picker-chosen folder; it is now ignored
// (kept optional so a pre-update client keeps working until the next Hosting release).
export const importDriveFolderInputSchema = z.object({ folderId: z.string().optional() });
export type ImportDriveFolderInput = z.infer<typeof importDriveFolderInputSchema>;
export const importDriveFolderOutputSchema = z.object({
  imported: z.number(),
  skipped: z.number(),
});
export type ImportDriveFolderOutput = z.infer<typeof importDriveFolderOutputSchema>;

// validateLibraryFolder — verify (via the docs-broker SA) that a candidate library-root id is a
// real, accessible, non-trashed Drive folder before an admin saves it. A discriminated result:
// { ok:true, name } on success, else { ok:false, reason } with a coarse (non-leaking) reason.
export const validateLibraryFolderInputSchema = z.object({ folderId: z.string().min(1) });
export type ValidateLibraryFolderInput = z.infer<typeof validateLibraryFolderInputSchema>;
export const validateLibraryFolderReasonSchema = z.enum([
  'not_found',
  'not_a_folder',
  'trashed',
  'inaccessible',
]);
export type ValidateLibraryFolderReason = z.infer<typeof validateLibraryFolderReasonSchema>;
export const validateLibraryFolderOutputSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), name: z.string() }),
  z.object({ ok: z.literal(false), reason: validateLibraryFolderReasonSchema }),
]);
export type ValidateLibraryFolderOutput = z.infer<typeof validateLibraryFolderOutputSchema>;

// Server-validated document registration (F-1): the server re-fetches Google's canonical
// metadata and verifies the file's Drive provenance, so clients no longer assert file ids
// or display metadata. All three return `{ ok }` (driveOkOutputSchema above).

// registerEventDocument — record a file that lives in the event's linked Drive folder.
export const registerEventDocumentInputSchema = z.object({
  eventId: z.string().min(1),
  fileId: z.string().min(1),
  displayName: z.string().nullable().optional(),
  day: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
});
export type RegisterEventDocumentInput = z.infer<typeof registerEventDocumentInputSchema>;

// registerArtistDocument — record a file that lives under the library root folder (the
// artist + metadata are derived server-side from its Drive subfolder).
export const registerArtistDocumentInputSchema = z.object({ fileId: z.string().min(1) });
export type RegisterArtistDocumentInput = z.infer<typeof registerArtistDocumentInputSchema>;

// includeArtistDocumentOnAdvance — copy a canonical `artistDocuments` record onto an advance.
export const includeAdvanceDocumentInputSchema = z.object({
  eventId: z.string().min(1),
  stageId: z.string().min(1),
  advanceId: z.string().min(1),
  artistDocumentId: z.string().min(1),
});
export type IncludeAdvanceDocumentInput = z.infer<typeof includeAdvanceDocumentInputSchema>;

// getArtistDocumentContent — serve an artist document's bytes via the service-account broker, so
// approved techs can view files in permission-gated Drive folders they can't open directly.
// fileId alone serves the artist library (approved users); with `eventId`, the file may
// instead be one of that event's documents — served to the event's members (PR 4).
export const getArtistDocumentContentInputSchema = z.object({
  fileId: z.string().min(1),
  eventId: z.string().min(1).optional(),
});
export type GetArtistDocumentContentInput = z.infer<typeof getArtistDocumentContentInputSchema>;
export const getArtistDocumentContentOutputSchema = z.object({
  base64: z.string(),
  mimeType: z.string(),
  name: z.string(),
});
export type GetArtistDocumentContentOutput = z.infer<typeof getArtistDocumentContentOutputSchema>;
