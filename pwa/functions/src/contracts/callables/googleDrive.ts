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

// importDriveFolder — import an artist-docs folder (per-artist subfolders) into the library.
export const importDriveFolderInputSchema = z.object({ folderId: z.string().min(1) });
export type ImportDriveFolderInput = z.infer<typeof importDriveFolderInputSchema>;
export const importDriveFolderOutputSchema = z.object({ imported: z.number(), skipped: z.number() });
export type ImportDriveFolderOutput = z.infer<typeof importDriveFolderOutputSchema>;

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
