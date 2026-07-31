/**
 * Canonical file-upload helpers (Firebase Storage). Used for production attachments
 * (stage plots / CAD / site maps); reusable for later document storage (quotes, portal).
 */
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/services/firebase';
import { createLogger } from '@/lib/logger';
// Shared with the packet renderer so the client can't accept an image the server won't embed.
import {
  IMAGE_SNIFF_BYTES,
  sniffImageFormat,
  type ImageFormat,
} from '@contracts/imageFormat';

const logger = createLogger('storage/uploads');

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
// Keep in lockstep with storage.rules `validUpload` (see uploads.test.ts for the parity check).
// These extensions all upload with a contentType the rules accept: pdf→application/pdf,
// png→image/png, jpg/jpeg→image/jpeg, dwg/dxf→application/octet-stream.
export const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'dwg', 'dxf'];

export interface UploadedFile {
  path: string;
  url: string;
  contentType: string;
  size: number;
}

/** Client-side validation. Returns an error message, or null if OK. */
export function validateUpload(file: File): string | null {
  // storage.rules gates on `size < 25MB` (strict), so a file at EXACTLY the limit is rejected
  // there — use `>=` here so the client pre-check never green-lights an upload the rules reject.
  if (file.size >= MAX_UPLOAD_BYTES) return 'File exceeds the 25 MB limit.';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) return 'Allowed types: PDF, PNG, JPG, DWG, DXF.';
  return null;
}

/** How to say each non-embeddable format in an error the uploader can act on. */
const FORMAT_LABELS: Readonly<Record<Exclude<ImageFormat, 'png' | 'jpeg' | 'unknown'>, string>> = {
  webp: 'WebP',
  gif: 'GIF',
};

const EMBED_HINT = 'PDF packets can only embed PNG or JPEG — re-save it as PNG and upload again.';

/** `.png` for `logo.png`; empty string when the name carries no extension. */
function extensionLabel(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? `.${parts[parts.length - 1].toLowerCase()}` : '';
}

/**
 * Read just the file header. `Blob.arrayBuffer()` is the modern path; the `FileReader` fallback
 * covers runtimes that predate it (older iOS Safari — and jsdom, which still omits it).
 */
async function readHeadBytes(file: File): Promise<Uint8Array> {
  const head = file.slice(0, IMAGE_SNIFF_BYTES);
  if (typeof head.arrayBuffer === 'function') return new Uint8Array(await head.arrayBuffer());
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('FileReader returned a non-buffer result'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsArrayBuffer(head);
  });
  return new Uint8Array(buffer);
}

/**
 * Validation for anything destined for a PDF packet logo/cover.
 *
 * WHY this exists (and why `validateUpload` alone is not enough): packets are rendered by
 * `@react-pdf/renderer` (`functions/src/lib/pdf/packet.tsx`), whose `<Image>` decodes **PNG and
 * JPEG only**. `validateUpload` trusts the filename, so a WebP renamed `logo.png` sails through
 * the client check, past storage.rules (the browser reports contentType `image/png` from the same
 * extension), and into Storage — where the renderer then throws "Incomplete or corrupt PNG file"
 * and the packet silently renders with no logo. That shipped and went unnoticed for weeks.
 *
 * So this reads the object's actual magic bytes and refuses anything the renderer can't embed,
 * naming the real format so the uploader knows what to fix. Async because reading the header is
 * async; `validateUpload` stays sync for the PDF/DWG/DXF paths that don't have this constraint.
 *
 * Returns an error message, or null if OK.
 */
export async function validateImageUpload(file: File): Promise<string | null> {
  const baseError = validateUpload(file);
  if (baseError) return baseError;

  let head: Uint8Array;
  try {
    head = await readHeadBytes(file);
  } catch (err) {
    logger.error('Could not read the file header to verify the image format', err);
    return `We couldn't read that file. ${EMBED_HINT}`;
  }

  if (head.length === 0) return `That file is empty. ${EMBED_HINT}`;

  const format = sniffImageFormat(head);
  if (format === 'png' || format === 'jpeg') return null;

  if (format !== 'unknown') {
    const ext = extensionLabel(file.name);
    const disguise = ext ? ` (despite the ${ext} name)` : '';
    return `That's a ${FORMAT_LABELS[format]} image${disguise}. ${EMBED_HINT}`;
  }
  return `That file isn't a PNG or JPEG — its contents don't match either format. ${EMBED_HINT}`;
}

export async function uploadFile(path: string, file: File | Blob): Promise<UploadedFile> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' });
  const url = await getDownloadURL(storageRef);
  return { path, url, contentType: file.type || 'application/octet-stream', size: file.size };
}

export async function deleteFile(path: string): Promise<void> {
  await deleteObject(ref(storage, path));
}

/**
 * Replace a stored asset with compensation (F-5). Uploads the new object, runs the caller's
 * durable `persist`, then deletes the OLD object only after persistence SUCCEEDS. If `persist`
 * throws, the NEW object is deleted instead (never the old) — so a failed metadata write can't
 * orphan the upload, and a failed save can never destroy the previously-persisted asset. Returns
 * whatever `persist` returns. For immediate-save flows (services, immediate-save parents).
 */
export async function replaceStoredAsset<T>(
  upload: () => Promise<UploadedFile>,
  persist: (uploaded: UploadedFile) => Promise<T>,
  previousPath: string | null,
): Promise<T> {
  const uploaded = await upload();
  let result: T;
  try {
    result = await persist(uploaded);
  } catch (err) {
    await deleteFile(uploaded.path).catch(() => undefined); // compensate: don't orphan the new object
    throw err;
  }
  if (previousPath && previousPath !== uploaded.path) {
    await deleteFile(previousPath).catch(() => undefined); // old object, only after the new ref is durable
  }
  return result;
}

/** Best-effort delete of every non-empty path (superseded or abandoned assets); never throws. */
export async function deleteStoredAssets(paths: readonly (string | null | undefined)[]): Promise<void> {
  await Promise.all(paths.map((p) => (p ? deleteFile(p).catch(() => undefined) : Promise.resolve())));
}
