/**
 * Server-side Drive provenance checks for document registration (F-1 hardening).
 * A neutral helper (no callable registration) so registration callables can verify a
 * file's real Drive location before recording it, and so the logic is unit-testable
 * with a mocked Drive client. Given a `drive_v3.Drive` (user OAuth or the broker SA).
 */
import type { drive_v3 } from 'googleapis';
import type { ValidateLibraryFolderOutput } from '../../contracts/callables/googleDrive.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Classify a fetched Drive file as a usable document-library root — pure so the ok/reason
 * decision is unit-testable without a live Drive. It must exist, be a Drive FOLDER, and not be
 * trashed. The caller does the fetch + maps any Drive error via `driveErrorReason`. A non-folder
 * is reported before trash so pasting a (possibly trashed) file id reads as "not a folder".
 */
export function classifyFolderFile(file: drive_v3.Schema$File): ValidateLibraryFolderOutput {
  if (!file.id) return { ok: false, reason: 'not_found' };
  if (file.mimeType !== FOLDER_MIME) return { ok: false, reason: 'not_a_folder' };
  if (file.trashed === true) return { ok: false, reason: 'trashed' };
  return { ok: true, name: file.name?.trim() || 'Drive folder' };
}

/** The HTTP status embedded in a googleapis (Gaxios) error, or null if none is present. */
function driveErrorStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const raw = e.code ?? e.status ?? e.response?.status;
  if (typeof raw === 'number') return raw;
  return typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : null;
}

/**
 * Map a Drive `files.get` failure to a coarse validation reason — never leak raw Drive error
 * text to the client. A 404 means the id doesn't resolve for the broker (`not_found`); anything
 * else (403 permission, network, etc.) is reported as `inaccessible`.
 */
export function driveErrorReason(err: unknown): 'not_found' | 'inaccessible' {
  return driveErrorStatus(err) === 404 ? 'not_found' : 'inaccessible';
}

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
