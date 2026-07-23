import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PACKET_FILENAME_PATTERN,
  PACKET_TYPE_LABEL,
  formatPacketFilename,
} from './packetFilename';

const tokens = {
  shortCode: 'BOTB',
  event: 'Summerfest 2026',
  date: '2026-07-23',
  type: PACKET_TYPE_LABEL,
};

describe('formatPacketFilename', () => {
  it('fills the default pattern', () => {
    expect(formatPacketFilename(DEFAULT_PACKET_FILENAME_PATTERN, tokens)).toBe(
      'BOTB Summerfest 2026 — Advance Packet',
    );
  });

  it('collapses a leading gap when the short code is empty', () => {
    expect(formatPacketFilename(DEFAULT_PACKET_FILENAME_PATTERN, { ...tokens, shortCode: '' })).toBe(
      'Summerfest 2026 — Advance Packet',
    );
  });

  it('supports the {date} token', () => {
    expect(formatPacketFilename('{date} — {event}', tokens)).toBe('2026-07-23 — Summerfest 2026');
  });

  it('strips filename-illegal characters but keeps spaces and hyphens', () => {
    expect(formatPacketFilename('{event}', { ...tokens, event: 'Rock/the:South "2026"' })).toBe(
      'Rock the South 2026',
    );
  });

  it('trims a dangling trailing separator when a token is empty', () => {
    expect(formatPacketFilename('{event} — {type}', { ...tokens, type: '' })).toBe('Summerfest 2026');
  });

  it('falls back to the event name for an all-blank pattern', () => {
    expect(formatPacketFilename('   ', tokens)).toBe('Summerfest 2026');
  });

  it('falls back to the default when the pattern is empty', () => {
    expect(formatPacketFilename('', tokens)).toBe('BOTB Summerfest 2026 — Advance Packet');
  });

  it('caps very long names', () => {
    const long = formatPacketFilename('{event}', { ...tokens, event: 'A'.repeat(200) });
    expect(long.length).toBeLessThanOrEqual(120);
  });
});
