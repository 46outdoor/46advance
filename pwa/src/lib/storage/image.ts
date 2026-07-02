/**
 * Client-side image downscaling before upload. Phone-camera photos are 4–12 MP; contact/profile
 * avatars render at ~64px, so we cap the longest side and re-encode to cut storage + load time.
 * The crop rectangle stored alongside is ratio-based (see `photoCropStyle`), so it stays valid on
 * the smaller image. Browser-only (canvas); returns the original file if it can't process it.
 */

/** Downscale `file` so its longest side ≤ `maxDim`, preserving aspect ratio. PNGs stay PNG; other
 * types re-encode to JPEG at `quality`. Returns the original file when it's already small enough
 * or on any failure. */
export async function downscaleImage(file: File, maxDim = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= maxDim) {
      bitmap.close();
      return file;
    }
    const scale = maxDim / longest;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    return blob ?? file;
  } catch {
    return file;
  }
}
