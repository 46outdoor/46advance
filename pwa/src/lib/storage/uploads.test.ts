import { describe, it, expect } from 'vitest';
import { validateUpload, MAX_UPLOAD_BYTES, ALLOWED_EXTENSIONS } from './uploads';

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
