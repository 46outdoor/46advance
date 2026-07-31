/**
 * Shared image-format detection — the one place that knows which formats a PDF packet can embed.
 *
 * Lives under `contracts/` for the same reason the callable schemas do: it must compile under BOTH
 * the Functions (nodenext/CJS) and PWA (bundler/ESM) toolchains, so it takes no dependencies and
 * imports nothing. The client reaches it via the `@contracts` alias; Functions via a relative
 * `./contracts/...js` path.
 *
 * Shared deliberately rather than duplicated. Both sides encode the SAME fact — `@react-pdf/renderer`
 * embeds PNG and JPEG only — and they gate the same image at different moments: the client refuses
 * the upload, the server refuses to embed it. If those two definitions drifted you'd get back
 * exactly the bug this was written for: an upload the client accepts, silently dropped at render
 * time, producing a packet missing its logo with no error anywhere.
 *
 * Detection is by magic bytes because nothing else can be trusted — a WebP hand-renamed `logo.png`
 * carries a `.png` extension AND an `image/png` contentType (the browser derives it from the name),
 * so filename, extension and stored metadata all agree and all lie.
 *
 * Takes `Uint8Array`; Node's `Buffer` extends it, so Functions can pass a downloaded buffer directly.
 */

/** Real, byte-level image format. `unknown` covers truncated headers and everything unlisted. */
export type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp' | 'unknown';

/** Leading bytes needed to identify every format below (WebP's marker sits at offset 8). */
export const IMAGE_SNIFF_BYTES = 16;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]; // \x89PNG\r\n\x1a\n
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]; // SOI + first marker
const GIF_SIGNATURE = [0x47, 0x49, 0x46]; // "GIF"
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]; // "RIFF" — a container; WebP only once "WEBP" follows
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * Identify an image by its magic bytes. Pass at least `IMAGE_SNIFF_BYTES` leading bytes; anything
 * shorter than a given signature simply won't match it, so truncated input reads as `unknown`
 * rather than throwing.
 */
export function sniffImageFormat(bytes: Uint8Array): ImageFormat {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'png';
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'jpeg';
  // Both halves required: plenty of non-image formats (WAV, AVI) are RIFF containers too.
  if (startsWith(bytes, RIFF_SIGNATURE) && startsWith(bytes, WEBP_SIGNATURE, 8)) return 'webp';
  if (startsWith(bytes, GIF_SIGNATURE)) return 'gif';
  return 'unknown';
}

/** The formats the PDF renderer can actually embed. */
export const EMBEDDABLE_IMAGE_FORMATS: readonly ImageFormat[] = ['png', 'jpeg'];

/** True when these bytes can be embedded in a generated packet. */
export function isEmbeddableImage(bytes: Uint8Array): boolean {
  return EMBEDDABLE_IMAGE_FORMATS.includes(sniffImageFormat(bytes));
}
