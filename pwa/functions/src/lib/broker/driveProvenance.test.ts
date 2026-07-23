import { describe, it, expect } from 'vitest';
import type { drive_v3 } from 'googleapis';
import {
  classifyFolderFile,
  driveErrorReason,
  getFileForRegistration,
  resolveArtistFolder,
} from './driveProvenance.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

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

describe('classifyFolderFile', () => {
  it('accepts a real, non-trashed folder and returns its name', () => {
    const r = classifyFolderFile({ id: 'root', name: 'ALL ARTIST Riders', mimeType: FOLDER_MIME });
    expect(r).toEqual({ ok: true, name: 'ALL ARTIST Riders' });
  });

  it('falls back to a generic name when the folder name is blank', () => {
    const r = classifyFolderFile({ id: 'root', name: '   ', mimeType: FOLDER_MIME });
    expect(r).toEqual({ ok: true, name: 'Drive folder' });
  });

  it('rejects a file (non-folder mime) as not_a_folder', () => {
    const r = classifyFolderFile({ id: 'f', name: 'Rider.pdf', mimeType: 'application/pdf' });
    expect(r).toEqual({ ok: false, reason: 'not_a_folder' });
  });

  it('reports a non-folder before trash (a trashed file reads as not_a_folder)', () => {
    const r = classifyFolderFile({ id: 'f', name: 'Rider.pdf', mimeType: 'application/pdf', trashed: true });
    expect(r).toEqual({ ok: false, reason: 'not_a_folder' });
  });

  it('rejects a trashed folder as trashed', () => {
    const r = classifyFolderFile({ id: 'root', name: 'Old', mimeType: FOLDER_MIME, trashed: true });
    expect(r).toEqual({ ok: false, reason: 'trashed' });
  });

  it('rejects a file with no id as not_found', () => {
    const r = classifyFolderFile({ mimeType: FOLDER_MIME });
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('driveErrorReason', () => {
  it('maps a 404 (numeric code) to not_found', () => {
    expect(driveErrorReason({ code: 404 })).toBe('not_found');
  });

  it('maps a 404 response status to not_found', () => {
    expect(driveErrorReason({ response: { status: 404 } })).toBe('not_found');
  });

  it('maps a 403 (permission) to inaccessible', () => {
    expect(driveErrorReason({ code: 403 })).toBe('inaccessible');
  });

  it('maps a non-numeric / network error code to inaccessible', () => {
    expect(driveErrorReason({ code: 'ENOTFOUND' })).toBe('inaccessible');
  });

  it('maps an unknown (non-object) error to inaccessible', () => {
    expect(driveErrorReason('boom')).toBe('inaccessible');
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
