import { describe, it, expect } from 'vitest';
import type { drive_v3 } from 'googleapis';
import {
  fetchBrokeredFileBytes,
  MAX_EMBED_BYTES,
  MAX_INTERACTIVE_CONTENT_BYTES,
} from './brokerFetch.js';

/** Turn a Buffer into a fresh ArrayBuffer, matching what googleapis returns for
 * `responseType: 'arraybuffer'` (the helper does `Buffer.from(res.data as ArrayBuffer)`). */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return Uint8Array.from(buf).buffer;
}

interface DriveStub {
  /** Bytes reported by the metadata preflight (`files.get({ fields: 'size' })`). */
  metaSize?: number;
  /** Bytes returned by the binary download (`files.get({ alt: 'media' })`). */
  downloadBytes?: Buffer;
  /** Bytes returned by a Google-native export (`files.export`). */
  exportBytes?: Buffer;
}

type GetParams = { fileId: string; fields?: string; alt?: string };

function mockDrive(stub: DriveStub): drive_v3.Drive {
  const files = {
    get: (params: GetParams) => {
      if (params.fields === 'size') {
        return Promise.resolve({ data: { size: String(stub.metaSize ?? 0) } });
      }
      return Promise.resolve({ data: toArrayBuffer(stub.downloadBytes ?? Buffer.alloc(0)) });
    },
    export: () => Promise.resolve({ data: toArrayBuffer(stub.exportBytes ?? Buffer.alloc(0)) }),
  };
  return { files } as unknown as drive_v3.Drive;
}

describe('fetchBrokeredFileBytes — bounded fetch', () => {
  it('returns binary bytes under the cap', async () => {
    const drive = mockDrive({ metaSize: 1000, downloadBytes: Buffer.alloc(1000, 1) });
    const result = await fetchBrokeredFileBytes(drive, 'f1', 'application/pdf', MAX_INTERACTIVE_CONTENT_BYTES);
    expect('tooLarge' in result).toBe(false);
    if (!('tooLarge' in result)) {
      expect(result.data.length).toBe(1000);
      expect(result.mimeType).toBe('application/pdf');
    }
  });

  it('rejects a binary file whose metadata size exceeds the cap (no download)', async () => {
    const drive = mockDrive({ metaSize: MAX_INTERACTIVE_CONTENT_BYTES + 1 });
    const result = await fetchBrokeredFileBytes(drive, 'big', 'application/pdf', MAX_INTERACTIVE_CONTENT_BYTES);
    expect(result).toEqual({ tooLarge: true });
  });

  it('rejects when the download outgrows a stale (small) metadata size', async () => {
    // Metadata under-reports; the Range-bounded download still comes back over the cap.
    const drive = mockDrive({
      metaSize: 10,
      downloadBytes: Buffer.alloc(MAX_INTERACTIVE_CONTENT_BYTES + 1, 1),
    });
    const result = await fetchBrokeredFileBytes(drive, 'stale', 'application/pdf', MAX_INTERACTIVE_CONTENT_BYTES);
    expect(result).toEqual({ tooLarge: true });
  });

  it('exports a Google-native doc to PDF (no preflight; caller does the post-hoc size check)', async () => {
    const drive = mockDrive({ exportBytes: Buffer.alloc(2000, 1) });
    const result = await fetchBrokeredFileBytes(
      drive,
      'gdoc',
      'application/vnd.google-apps.document',
      MAX_INTERACTIVE_CONTENT_BYTES,
    );
    expect('tooLarge' in result).toBe(false);
    if (!('tooLarge' in result)) {
      expect(result.mimeType).toBe('application/pdf');
      expect(result.data.length).toBe(2000);
    }
  });

  it('rejects a non-exportable Google-native item type', async () => {
    const drive = mockDrive({});
    await expect(
      fetchBrokeredFileBytes(drive, 'folder', 'application/vnd.google-apps.folder', MAX_INTERACTIVE_CONTENT_BYTES),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('without a cap, returns bytes regardless of size (packet path passes its own cap)', async () => {
    const drive = mockDrive({ downloadBytes: Buffer.alloc(5000, 1) });
    const result = await fetchBrokeredFileBytes(drive, 'f2', 'image/png');
    expect('tooLarge' in result).toBe(false);
    if (!('tooLarge' in result)) expect(result.data.length).toBe(5000);
  });

  it('the interactive cap is below the packet cap and stays under the callable limit once base64-encoded', () => {
    expect(MAX_INTERACTIVE_CONTENT_BYTES).toBeLessThan(MAX_EMBED_BYTES);
    const base64Bytes = Math.ceil(MAX_INTERACTIVE_CONTENT_BYTES / 3) * 4;
    expect(base64Bytes).toBeLessThan(10 * 1024 * 1024);
  });
});
