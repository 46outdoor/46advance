import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteObject } from 'firebase/storage';
import {
  validateUpload,
  MAX_UPLOAD_BYTES,
  ALLOWED_EXTENSIONS,
  replaceStoredAsset,
  deleteStoredAssets,
} from './uploads';

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
