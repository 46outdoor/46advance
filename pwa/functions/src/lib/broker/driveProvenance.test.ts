import { describe, it, expect } from 'vitest';
import type { drive_v3 } from 'googleapis';
import { getFileForRegistration, resolveArtistFolder } from './driveProvenance.js';

// A small Drive tree:
//   root
//   └── artist "Jelly Roll"  (id: artist)
//        └── deep (id: deep)
//             └── deep-file
//        └── file-1
//   root-file            (directly under root — unsorted)
//   outside              (NOT under root)
//        └── stray-file
interface Node {
  id: string;
  name: string;
  parents?: string[];
  mimeType?: string;
  webViewLink?: string;
  iconLink?: string;
}
const NODES: Record<string, Node> = {
  root: { id: 'root', name: 'Library' },
  artist: { id: 'artist', name: 'Jelly Roll', parents: ['root'] },
  deep: { id: 'deep', name: 'Riders', parents: ['artist'] },
  'file-1': {
    id: 'file-1', name: 'Rider.pdf', parents: ['artist'],
    mimeType: 'application/pdf', webViewLink: 'https://drive/x', iconLink: 'https://icon/x',
  },
  'deep-file': {
    id: 'deep-file', name: 'Deep.pdf', parents: ['deep'],
    mimeType: 'application/pdf', webViewLink: 'https://drive/d',
  },
  'root-file': {
    id: 'root-file', name: 'Loose.pdf', parents: ['root'],
    mimeType: 'application/pdf', webViewLink: 'https://drive/y',
  },
  outside: { id: 'outside', name: 'Other', parents: ['elsewhere'] },
  'stray-file': {
    id: 'stray-file', name: 'Secret.pdf', parents: ['outside'],
    mimeType: 'application/pdf', webViewLink: 'https://drive/z',
  },
};

function mockDrive(): drive_v3.Drive {
  const get = (params: { fileId: string }) => {
    const node = NODES[params.fileId];
    if (!node) return Promise.reject(new Error('404 not found'));
    return Promise.resolve({
      data: {
        id: node.id, name: node.name, parents: node.parents,
        mimeType: node.mimeType, webViewLink: node.webViewLink, iconLink: node.iconLink,
      },
    });
  };
  return { files: { get } } as unknown as drive_v3.Drive;
}

const MAX_DEPTH = 12;

describe('getFileForRegistration', () => {
  it('returns server-trusted metadata + parents for an accessible file', async () => {
    const meta = await getFileForRegistration(mockDrive(), 'file-1');
    expect(meta).toEqual({
      id: 'file-1', name: 'Rider.pdf', mimeType: 'application/pdf',
      iconLink: 'https://icon/x', webViewLink: 'https://drive/x', parents: ['artist'],
    });
  });

  it('returns null for an inaccessible / missing file', async () => {
    expect(await getFileForRegistration(mockDrive(), 'nope')).toBeNull();
  });
});

describe('resolveArtistFolder', () => {
  it('resolves a file under an artist subfolder to that folder + name', async () => {
    const r = await resolveArtistFolder(mockDrive(), 'artist', 'root', MAX_DEPTH);
    expect(r).toEqual({ underRoot: true, artistFolderId: 'artist', artistName: 'Jelly Roll' });
  });

  it('resolves a deeply-nested file to its top-level artist folder', async () => {
    // deep-file -> deep -> artist -> root: the artist folder is the immediate child of root.
    const r = await resolveArtistFolder(mockDrive(), 'deep', 'root', MAX_DEPTH);
    expect(r).toEqual({ underRoot: true, artistFolderId: 'artist', artistName: 'Jelly Roll' });
  });

  it('treats a file directly in root as unsorted (under root, no artist)', async () => {
    const r = await resolveArtistFolder(mockDrive(), 'root', 'root', MAX_DEPTH);
    expect(r).toEqual({ underRoot: true, artistFolderId: null, artistName: null });
  });

  it('rejects a file that is not under the library root', async () => {
    const r = await resolveArtistFolder(mockDrive(), 'outside', 'root', MAX_DEPTH);
    expect(r.underRoot).toBe(false);
  });

  it('rejects a file with no parent', async () => {
    const r = await resolveArtistFolder(mockDrive(), null, 'root', MAX_DEPTH);
    expect(r.underRoot).toBe(false);
  });

  it('rejects rather than looping past the depth cap', async () => {
    const r = await resolveArtistFolder(mockDrive(), 'artist', 'root', 0);
    expect(r.underRoot).toBe(false);
  });
});
