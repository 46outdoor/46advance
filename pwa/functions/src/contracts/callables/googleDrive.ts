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
