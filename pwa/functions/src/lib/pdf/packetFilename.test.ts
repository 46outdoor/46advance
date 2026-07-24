import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PACKET_FILENAME_PATTERN,
  DEFAULT_PACKET_TYPE_LABEL,
  formatPacketFilename,
} from './packetFilename';

const tokens = {
  shortCode: 'BOTB',
  festival: 'Rock the Country',
  location: 'Ashland',
  event: 'Rock the Country 2026 — Ashland',
  date: '07-10-26',
  version: 'v2',
  type: DEFAULT_PACKET_TYPE_LABEL,
};

describe('formatPacketFilename', () => {
  it('fills the default pattern ({shortCode} {date} {version} — {type})', () => {
    expect(formatPacketFilename(DEFAULT_PACKET_FILENAME_PATTERN, tokens)).toBe(
      'BOTB 07-10-26 v2 — Production and Artist Advance',
    );
  });

  it('supports the festival + location tokens', () => {
    expect(formatPacketFilename('{festival} {location} {date}', tokens)).toBe(
      'Rock the Country Ashland 07-10-26',
    );
  });

  it('collapses a leading gap when the short code is empty', () => {
    expect(formatPacketFilename(DEFAULT_PACKET_FILENAME_PATTERN, { ...tokens, shortCode: '' })).toBe(
      '07-10-26 v2 — Production and Artist Advance',
    );
  });

  it('drops the version token when blank', () => {
    expect(formatPacketFilename(DEFAULT_PACKET_FILENAME_PATTERN, { ...tokens, version: '' })).toBe(
      'BOTB 07-10-26 — Production and Artist Advance',
    );
  });

  it('strips filename-illegal characters but keeps spaces and hyphens', () => {
    expect(formatPacketFilename('{festival}', { ...tokens, festival: 'Rock/the:Country' })).toBe(
      'Rock the Country',
    );
  });

  it('falls back to the event name for an all-blank pattern', () => {
    expect(formatPacketFilename('   ', tokens)).toBe('Rock the Country 2026 — Ashland');
  });

  it('falls back to the default when the pattern is empty', () => {
    expect(formatPacketFilename('', tokens)).toBe(
      'BOTB 07-10-26 v2 — Production and Artist Advance',
    );
  });

  it('caps very long names', () => {
    const long = formatPacketFilename('{event}', { ...tokens, event: 'A'.repeat(200) });
    expect(long.length).toBeLessThanOrEqual(120);
  });
});
