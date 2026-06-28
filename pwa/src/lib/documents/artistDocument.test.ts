import { describe, it, expect } from 'vitest';
import {
  artistKey,
  artistsFromDocuments,
  documentTitle,
  isVerifiedCurrent,
  parseArtistDocument,
  type ArtistDocument,
} from './artistDocument';

describe('documentTitle', () => {
  it('uses the in-app override, else the Drive filename', () => {
    expect(documentTitle({ displayName: 'Rider (final)', name: 'TR_v3.pdf' })).toBe('Rider (final)');
    expect(documentTitle({ displayName: null, name: 'TR_v3.pdf' })).toBe('TR_v3.pdf');
    expect(documentTitle({ displayName: '   ', name: 'TR_v3.pdf' })).toBe('TR_v3.pdf');
  });
});

describe('isVerifiedCurrent', () => {
  const now = new Date('2026-06-28');
  it('is false when never verified', () => {
    expect(isVerifiedCurrent(null, now)).toBe(false);
  });
  it('is true within 6 months, false after', () => {
    expect(isVerifiedCurrent(new Date('2026-05-01'), now)).toBe(true); // ~2 months ago
    expect(isVerifiedCurrent(new Date('2025-12-01'), now)).toBe(false); // ~7 months ago
  });
});

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
    displayName: null,
    notes: null,
    obsolete: false,
    verifiedAt: null,
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
