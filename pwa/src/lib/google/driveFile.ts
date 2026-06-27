/**
 * A Google Drive file linked to an advance (Phase 13). One doc per file in the
 * `events/{e}/stages/{s}/advances/{a}/driveFiles/{fileId}` subcollection, written
 * server-side only (functions/src/googleDrive.ts `linkDriveFile`/`removeDriveFile`)
 * and read via advances-service `listDriveFiles`. `webViewLink` is Google's canonical
 * URL; whether a given viewer can open it depends on their own Drive access.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';

export interface DriveFileRef {
  fileId: string;
  name: string;
  mimeType: string;
  iconLink: string | null;
  webViewLink: string;
  linkedByUid: string;
  linkedByEmail: string | null;
  linkedAt: Date | null;
}

const driveFileDocSchema = z.object({
  fileId: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().optional(),
  iconLink: z.string().nullable().optional(),
  webViewLink: z.string().min(1),
  linkedByUid: z.string().min(1),
  linkedByEmail: z.string().nullable().optional(),
  linkedAt: z.instanceof(Timestamp).nullable().optional(),
});

export function parseDriveFile(data: unknown): DriveFileRef {
  const d = driveFileDocSchema.parse(data);
  return {
    fileId: d.fileId,
    name: d.name,
    mimeType: d.mimeType ?? 'application/octet-stream',
    iconLink: d.iconLink ?? null,
    webViewLink: d.webViewLink,
    linkedByUid: d.linkedByUid,
    linkedByEmail: d.linkedByEmail ?? null,
    linkedAt: timestampToDate(d.linkedAt ?? null),
  };
}
