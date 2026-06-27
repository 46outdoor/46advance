import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { parseDriveFile } from './driveFile';

describe('parseDriveFile', () => {
  it('parses a valid doc and converts the timestamp', () => {
    const ts = Timestamp.fromMillis(1_700_000_000_000);
    const file = parseDriveFile({
      fileId: 'a',
      name: 'Plot.pdf',
      mimeType: 'application/pdf',
      webViewLink: 'https://drive.google.com/a',
      iconLink: 'icon',
      linkedByUid: 'u1',
      linkedByEmail: 'u@x.com',
      linkedAt: ts,
    });
    expect(file).toMatchObject({ fileId: 'a', name: 'Plot.pdf', linkedByEmail: 'u@x.com' });
    expect(file.linkedAt).toEqual(ts.toDate());
  });

  it('defaults mimeType and nullable fields', () => {
    const file = parseDriveFile({
      fileId: 'a',
      name: 'n',
      webViewLink: 'https://drive.google.com/a',
      linkedByUid: 'u',
    });
    expect(file.mimeType).toBe('application/octet-stream');
    expect(file.iconLink).toBeNull();
    expect(file.linkedByEmail).toBeNull();
    expect(file.linkedAt).toBeNull();
  });

  it('throws on a malformed doc (missing id or link)', () => {
    expect(() => parseDriveFile({ name: 'no id', webViewLink: 'x', linkedByUid: 'u' })).toThrow();
    expect(() => parseDriveFile({ fileId: 'no-link', name: 'n', linkedByUid: 'u' })).toThrow();
  });
});
