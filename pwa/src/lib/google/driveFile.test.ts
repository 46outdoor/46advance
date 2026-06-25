import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { parseDriveFiles } from './driveFile';

describe('parseDriveFiles', () => {
  it('parses valid entries and converts the timestamp', () => {
    const ts = Timestamp.fromMillis(1_700_000_000_000);
    const files = parseDriveFiles([
      {
        fileId: 'a',
        name: 'Plot.pdf',
        mimeType: 'application/pdf',
        webViewLink: 'https://drive.google.com/a',
        iconLink: 'icon',
        linkedByUid: 'u1',
        linkedByEmail: 'u@x.com',
        linkedAt: ts,
      },
    ]);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ fileId: 'a', name: 'Plot.pdf', linkedByEmail: 'u@x.com' });
    expect(files[0].linkedAt).toEqual(ts.toDate());
  });

  it('tolerates non-arrays and skips malformed entries', () => {
    expect(parseDriveFiles(undefined)).toEqual([]);
    expect(parseDriveFiles('nope')).toEqual([]);
    const files = parseDriveFiles([
      { fileId: 'ok', name: 'n', webViewLink: 'https://drive.google.com/ok', linkedByUid: 'u' },
      { name: 'no id', webViewLink: 'x', linkedByUid: 'u' },
      { fileId: 'no-link', name: 'n', linkedByUid: 'u' },
    ]);
    expect(files.map((f) => f.fileId)).toEqual(['ok']);
  });

  it('defaults mimeType and nullable fields', () => {
    const [file] = parseDriveFiles([
      { fileId: 'a', name: 'n', webViewLink: 'https://drive.google.com/a', linkedByUid: 'u' },
    ]);
    expect(file.mimeType).toBe('application/octet-stream');
    expect(file.iconLink).toBeNull();
    expect(file.linkedByEmail).toBeNull();
    expect(file.linkedAt).toBeNull();
  });
});
