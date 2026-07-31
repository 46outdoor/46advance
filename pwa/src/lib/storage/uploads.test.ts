import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteObject } from 'firebase/storage';
import {
  validateUpload,
  validateImageUpload,
  MAX_UPLOAD_BYTES,
  ALLOWED_EXTENSIONS,
  replaceStoredAsset,
  deleteStoredAssets,
} from './uploads';
// The sniffer is shared with the packet renderer, so it lives in contracts/ (see its header).
import { sniffImageFormat } from '@contracts/imageFormat';

vi.mock('@/services/firebase', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({
  ref: (_storage: unknown, path: string) => ({ path }),
  deleteObject: vi.fn(() => Promise.resolve()),
  uploadBytes: vi.fn(() => Promise.resolve()),
  getDownloadURL: vi.fn(() => Promise.resolve('https://example/url')),
}));

const deleteObjectMock = vi.mocked(deleteObject);
const deletedPaths = (): string[] =>
  deleteObjectMock.mock.calls.map((c) => (c[0] as unknown as { path: string }).path);

/** A File whose `.size` we can set (File.size is otherwise read-only in jsdom). */
function fileOf(name: string, size: number, type = ''): File {
  const f = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('validateUpload', () => {
  it('accepts every allowed extension under the size limit', () => {
    for (const ext of ALLOWED_EXTENSIONS) {
      expect(validateUpload(fileOf(`file.${ext}`, 1024))).toBeNull();
    }
  });

  it('rejects a disallowed extension', () => {
    expect(validateUpload(fileOf('evil.exe', 1024))).not.toBeNull();
    expect(validateUpload(fileOf('archive.zip', 1024))).not.toBeNull();
    expect(validateUpload(fileOf('noext', 1024))).not.toBeNull();
  });

  it('is case-insensitive on the extension', () => {
    expect(validateUpload(fileOf('SCAN.PDF', 1024))).toBeNull();
  });

  it('rejects at or over 25 MB — matching storage.rules `size < 25MB` (strict)', () => {
    expect(validateUpload(fileOf('exact.pdf', MAX_UPLOAD_BYTES))).not.toBeNull(); // exactly the limit → rejected, like the rules
    expect(validateUpload(fileOf('over.pdf', MAX_UPLOAD_BYTES + 1))).not.toBeNull();
    expect(validateUpload(fileOf('under.pdf', MAX_UPLOAD_BYTES - 1))).toBeNull();
  });
});

// Real headers, built inline — no binary fixtures in the repo. Only the leading bytes matter;
// the sniffer never looks past IMAGE_SNIFF_BYTES.
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
// "RIFF" + 4-byte length + "WEBP" + "VP8 " — the exact shape of the logo that broke production.
const WEBP_HEADER = [
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
];
const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x10, 0x00, 0x80, 0x00];

/** A File with real leading bytes, so `validateImageUpload` can sniff it. */
function imageFile(name: string, bytes: readonly number[]): File {
  return new File([new Uint8Array(bytes)], name);
}

describe('sniffImageFormat', () => {
  it('identifies each format from its magic bytes', () => {
    expect(sniffImageFormat(new Uint8Array(PNG_HEADER))).toBe('png');
    expect(sniffImageFormat(new Uint8Array(JPEG_HEADER))).toBe('jpeg');
    expect(sniffImageFormat(new Uint8Array(WEBP_HEADER))).toBe('webp');
    expect(sniffImageFormat(new Uint8Array(GIF_HEADER))).toBe('gif');
  });

  it('returns unknown for empty, truncated, and unrecognized headers', () => {
    expect(sniffImageFormat(new Uint8Array(0))).toBe('unknown');
    expect(sniffImageFormat(new Uint8Array(PNG_HEADER.slice(0, 4)))).toBe('unknown'); // truncated PNG
    expect(sniffImageFormat(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe('unknown'); // %PDF
  });

  it('does not treat a non-WebP RIFF container as WebP', () => {
    // "RIFF" + length + "WAVE" — same container, different payload.
    const wav = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
    expect(sniffImageFormat(new Uint8Array(wav))).toBe('unknown');
  });
});

describe('validateImageUpload (byte-level format gate)', () => {
  it('accepts a real PNG', async () => {
    await expect(validateImageUpload(imageFile('logo.png', PNG_HEADER))).resolves.toBeNull();
  });

  it('accepts a real JPEG', async () => {
    await expect(validateImageUpload(imageFile('logo.jpg', JPEG_HEADER))).resolves.toBeNull();
    await expect(validateImageUpload(imageFile('logo.jpeg', JPEG_HEADER))).resolves.toBeNull();
  });

  it('rejects a WebP named .png and names the real format (the production bug)', async () => {
    const err = await validateImageUpload(imageFile('event-logo.png', WEBP_HEADER));
    expect(err).toContain('WebP');
    expect(err).toContain('.png'); // calls out the lying extension
    expect(err).toContain('PNG or JPEG'); // says what to do about it
  });

  it('rejects a GIF', async () => {
    const err = await validateImageUpload(imageFile('animation.png', GIF_HEADER));
    expect(err).toContain('GIF');
    expect(err).toContain('PNG or JPEG');
  });

  it('rejects a truncated image whose header never completes', async () => {
    const err = await validateImageUpload(imageFile('cut.png', PNG_HEADER.slice(0, 4)));
    expect(err).not.toBeNull();
    expect(err).toContain('PNG or JPEG');
  });

  it('rejects an empty file', async () => {
    const err = await validateImageUpload(imageFile('empty.png', []));
    expect(err).not.toBeNull();
    expect(err).toContain('empty');
  });

  it('rejects a PDF on the image path even though validateUpload allows the extension', async () => {
    const pdf = imageFile('doc.pdf', [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
    expect(validateUpload(pdf)).toBeNull(); // still fine for attachments
    await expect(validateImageUpload(pdf)).resolves.toContain('PNG or JPEG'); // not for logos
  });

  it('sniffs via Blob.arrayBuffer() when the runtime provides it (browsers do; jsdom does not)', async () => {
    // jsdom omits Blob.prototype.arrayBuffer, so the suite otherwise only covers the FileReader
    // fallback. Install the real-browser API for this case and assert the same verdicts.
    Blob.prototype.arrayBuffer = function readAll(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(reader.result instanceof ArrayBuffer ? reader.result : new ArrayBuffer(0));
        reader.readAsArrayBuffer(this);
      });
    };
    try {
      await expect(validateImageUpload(imageFile('logo.png', PNG_HEADER))).resolves.toBeNull();
      await expect(validateImageUpload(imageFile('logo.png', WEBP_HEADER))).resolves.toContain(
        'WebP',
      );
    } finally {
      Reflect.deleteProperty(Blob.prototype, 'arrayBuffer'); // back to the jsdom default
    }
  });

  it('still enforces the validateUpload gates before sniffing', async () => {
    await expect(validateImageUpload(imageFile('evil.exe', PNG_HEADER))).resolves.toBe(
      'Allowed types: PDF, PNG, JPG, DWG, DXF.',
    );
    const big = imageFile('huge.png', PNG_HEADER);
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES });
    await expect(validateImageUpload(big)).resolves.toBe('File exceeds the 25 MB limit.');
  });
});

describe('replaceStoredAsset (F-5 compensation)', () => {
  beforeEach(() => deleteObjectMock.mockClear());
  const upload = (path: string) => () =>
    Promise.resolve({ path, url: 'u', contentType: 'application/pdf', size: 1 });

  it('deletes the previous object only after the persist succeeds', async () => {
    const persist = vi.fn(() => Promise.resolve('saved'));
    const result = await replaceStoredAsset(upload('new/a'), persist, 'old/a');
    expect(result).toBe('saved');
    expect(persist).toHaveBeenCalledOnce();
    expect(deletedPaths()).toEqual(['old/a']); // old dropped, new kept
  });

  it('deletes the NEW object (never the old) and rethrows when persist fails', async () => {
    const persist = vi.fn(() => Promise.reject(new Error('save failed')));
    await expect(replaceStoredAsset(upload('new/b'), persist, 'old/b')).rejects.toThrow('save failed');
    expect(deletedPaths()).toEqual(['new/b']); // new dropped, old preserved
  });

  it('deletes nothing when there is no previous object and the save succeeds', async () => {
    await replaceStoredAsset(upload('new/c'), () => Promise.resolve(), null);
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });
});

describe('deleteStoredAssets', () => {
  beforeEach(() => deleteObjectMock.mockClear());

  it('deletes each non-empty path and skips null/undefined/empty', async () => {
    await deleteStoredAssets(['a', null, 'b', undefined, '']);
    expect(deletedPaths().sort()).toEqual(['a', 'b']);
  });

  it('never rejects even if a delete throws', async () => {
    deleteObjectMock.mockRejectedValueOnce(new Error('boom'));
    await expect(deleteStoredAssets(['x', 'y'])).resolves.toBeUndefined();
  });
});
