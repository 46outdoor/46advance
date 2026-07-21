/**
 * Server-side Drive provenance checks for document registration (F-1 hardening).
 * A neutral helper (no callable registration) so registration callables can verify a
 * file's real Drive location before recording it, and so the logic is unit-testable
 * with a mocked Drive client. Given a `drive_v3.Drive` (user OAuth or the broker SA).
 */
import type { drive_v3 } from 'googleapis';

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  iconLink: string | null;
  webViewLink: string;
  /** The file's parent folder ids (normally one). */
  parents: string[];
}

/** Fetch a Drive file's server-trusted registration metadata + parent folder ids.
 * Returns null if the file is inaccessible or missing required fields. */
export async function getFileForRegistration(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<DriveFileMeta | null> {
  let file: drive_v3.Schema$File;
  try {
    const res = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,iconLink,webViewLink,parents',
      supportsAllDrives: true,
    });
    file = res.data;
  } catch {
    return null;
  }
  if (!file.id || !file.name || !file.webViewLink) return null;
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType ?? 'application/octet-stream',
    iconLink: file.iconLink ?? null,
    webViewLink: file.webViewLink,
    parents: file.parents ?? [],
  };
}

export interface ArtistFolderResolution {
  /** Whether the file's folder chain reaches the library root within the depth cap. */
  underRoot: boolean;
  /** The immediate child of root on that path (the artist subfolder); null if the file
   * sits directly in root (unsorted). */
  artistFolderId: string | null;
  /** The artist subfolder's Drive name (the artist label); null when unsorted. */
  artistName: string | null;
}

const NOT_UNDER_ROOT: ArtistFolderResolution = { underRoot: false, artistFolderId: null, artistName: null };

/** Walk a file's parent chain from `firstParent` up toward `rootFolderId` (depth-capped),
 * confirming the file lives under the library root and identifying its artist subfolder
 * (the immediate child of root). Mirrors importDriveFolder's enumeration semantics: a file
 * directly in root is "unsorted" (artist null). */
export async function resolveArtistFolder(
  drive: drive_v3.Drive,
  firstParent: string | null,
  rootFolderId: string,
  maxDepth: number,
): Promise<ArtistFolderResolution> {
  let child: { id: string; name: string | null } | null = null;
  let currentId = firstParent;
  for (let depth = 0; currentId && depth <= maxDepth; depth += 1) {
    if (currentId === rootFolderId) {
      return { underRoot: true, artistFolderId: child?.id ?? null, artistName: child?.name ?? null };
    }
    let parents: string[] | undefined;
    let name: string | null;
    try {
      const res = await drive.files.get({ fileId: currentId, fields: 'id,name,parents', supportsAllDrives: true });
      parents = res.data.parents ?? undefined;
      name = res.data.name ?? null;
    } catch {
      return NOT_UNDER_ROOT;
    }
    child = { id: currentId, name };
    currentId = parents?.[0] ?? null;
  }
  return NOT_UNDER_ROOT;
}
