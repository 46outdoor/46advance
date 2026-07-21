/**
 * Bounded content fetch for the Drive docs-broker service account, plus the byte caps
 * that govern how much broker-served content each path will buffer. Centralized here
 * (a neutral module, no callable registration) so the interactive-view and packet-embed
 * paths share one intentional policy and the fetch logic is unit-testable without Drive.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import type { drive_v3 } from 'googleapis';

/** Max raw bytes embedded per attachment in a generated packet PDF; larger files are
 * listed on the divider with an open-in-app note instead of being embedded. */
export const MAX_EMBED_BYTES = 10 * 1024 * 1024;

/** Max raw bytes returned by getArtistDocumentContent (the in-app document viewer). The
 * bytes are base64-encoded (~33% overhead) into the callable response, which must stay
 * under Firebase's ~10 MB callable-response limit — so the raw cap sits well below it.
 * Oversized documents are rejected; the client points the user to Drive instead. */
export const MAX_INTERACTIVE_CONTENT_BYTES = 7 * 1024 * 1024;

/** Workspace types `files.export` can actually convert to PDF — `vnd.google-apps.*`
 * also covers folders and shortcuts, which would 400 on export. */
const EXPORTABLE_GOOGLE_MIMES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
]);

/** Fetch a file's bytes via a broker Drive client. Google-native docs (Docs/Sheets/
 * Slides — common for riders) can't be downloaded raw (`files.get?alt=media` 403s);
 * exportable ones convert to PDF, which is universally viewable and packet-embeddable.
 * With `maxBytes`, binary files preflight their metadata size and return
 * `{ tooLarge: true }` instead of buffering an oversized download, and the download
 * itself is Range-bounded to the cap in case the metadata was stale (native exports
 * have no size until exported — the caller's post-hoc length check covers those). */
export async function fetchBrokeredFileBytes(
  drive: drive_v3.Drive,
  fileId: string,
  storedMime: string,
  maxBytes?: number,
): Promise<{ data: Buffer; mimeType: string } | { tooLarge: true }> {
  if (storedMime.startsWith('application/vnd.google-apps.')) {
    if (!EXPORTABLE_GOOGLE_MIMES.has(storedMime)) {
      throw new HttpsError('failed-precondition', 'This Google Drive item type cannot be exported.');
    }
    const res = await drive.files.export({ fileId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' });
    return { data: Buffer.from(res.data as ArrayBuffer), mimeType: 'application/pdf' };
  }
  if (maxBytes !== undefined) {
    const meta = await drive.files.get({ fileId, fields: 'size', supportsAllDrives: true });
    const size = Number(meta.data.size ?? 0);
    if (size > maxBytes) return { tooLarge: true };
  }
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    {
      responseType: 'arraybuffer',
      // One byte past the cap: a full-length 206/200 response means the file outgrew
      // its preflighted metadata size, so the length check below still catches it.
      ...(maxBytes !== undefined && { headers: { Range: `bytes=0-${maxBytes}` } }),
    },
  );
  const data = Buffer.from(res.data as ArrayBuffer);
  if (maxBytes !== undefined && data.length > maxBytes) return { tooLarge: true };
  return { data, mimeType: storedMime || 'application/octet-stream' };
}
