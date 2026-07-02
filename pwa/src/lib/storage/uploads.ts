/**
 * Canonical file-upload helpers (Firebase Storage). Used for production attachments
 * (stage plots / CAD / site maps); reusable for later document storage (quotes, portal).
 */
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/services/firebase';

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

export async function uploadFile(path: string, file: File): Promise<UploadedFile> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' });
  const url = await getDownloadURL(storageRef);
  return { path, url, contentType: file.type || 'application/octet-stream', size: file.size };
}

export async function deleteFile(path: string): Promise<void> {
  await deleteObject(ref(storage, path));
}
