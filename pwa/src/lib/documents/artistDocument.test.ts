import { describe, it, expect } from 'vitest';
import { artistKey, artistsFromDocuments, parseArtistDocument, type ArtistDocument } from './artistDocument';

describe('artistKey', () => {
  it('normalizes to a lowercase, whitespace-collapsed key', () => {
    expect(artistKey('  Jelly  Roll ')).toBe('jelly roll');
    expect(artistKey('RTC')).toBe('rtc');
  });
});

describe('parseArtistDocument', () => {
  it('parses a doc and applies defaults', () => {
    const d = parseArtistDocument('f1', {
      fileId: 'f1',
      name: 'Rider.pdf',
      webViewLink: 'https://drive/x',
      importedBy: 'u',
      artist: 'Jelly Roll',
      artistKey: 'jelly roll',
    });
    expect(d.name).toBe('Rider.pdf');
    expect(d.artist).toBe('Jelly Roll');
    expect(d.categoryId).toBeNull();
    expect(d.mimeType).toBe('application/octet-stream');
  });
});

describe('artistsFromDocuments', () => {
  const make = (artist: string | null, key: string | null, fileId: string): ArtistDocument => ({
    id: fileId,
    fileId,
    name: 'x',
    mimeType: 'application/pdf',
    iconLink: null,
    webViewLink: 'https://drive/x',
    artist,
    artistKey: key,
    categoryId: null,
    importedBy: 'u',
    importedByEmail: null,
    importedAt: null,
  });

  it('groups distinct artists with counts, excluding unsorted (null artist)', () => {
    const docs = [
      make('Jelly Roll', 'jelly roll', '1'),
      make('Jelly Roll', 'jelly roll', '2'),
      make('RTC', 'rtc', '3'),
      make(null, null, '4'),
    ];
    expect(artistsFromDocuments(docs)).toEqual([
      { key: 'jelly roll', name: 'Jelly Roll', count: 2 },
      { key: 'rtc', name: 'RTC', count: 1 },
    ]);
  });
});
