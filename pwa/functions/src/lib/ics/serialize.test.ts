import { describe, expect, it } from 'vitest';
import { escapeIcsText, foldIcsLine, icsDate, icsUtcStamp, serializeIcs } from './serialize';

describe('escapeIcsText', () => {
  it('escapes backslash, newline, comma, and semicolon', () => {
    expect(escapeIcsText('a\\b')).toBe('a\\\\b');
    expect(escapeIcsText('line1\nline2')).toBe('line1\\nline2');
    expect(escapeIcsText('a,b;c')).toBe('a\\,b\\;c');
  });

  it('escapes the backslash first so introduced sequences are not double-escaped', () => {
    expect(escapeIcsText('a\\nb')).toBe('a\\\\nb');
  });
});

describe('icsUtcStamp', () => {
  it('formats a Date as YYYYMMDDTHHMMSSZ', () => {
    expect(icsUtcStamp(new Date('2026-08-06T18:00:00Z'))).toBe('20260806T180000Z');
    expect(icsUtcStamp(new Date('2026-01-02T03:04:05.678Z'))).toBe('20260102T030405Z');
  });
});

describe('icsDate', () => {
  it('formats a day key as YYYYMMDD', () => {
    expect(icsDate('2026-08-15')).toBe('20260815');
  });
});

describe('foldIcsLine', () => {
  const octets = (s: string) => Buffer.byteLength(s, 'utf8');
  /** Every physical line of a folded result must fit the 75-octet cap. */
  const physicalLines = (folded: string) => folded.split('\r\n');
  /** RFC 5545 unfold: drop CRLF + single leading space. */
  const unfold = (folded: string) => folded.replace(/\r\n /g, '');

  it('leaves short lines alone', () => {
    expect(foldIcsLine('SUMMARY:Short')).toBe('SUMMARY:Short');
    const exactly75 = 'X'.repeat(75);
    expect(foldIcsLine(exactly75)).toBe(exactly75);
  });

  it('folds long ASCII lines at 75 octets with a space continuation', () => {
    const folded = foldIcsLine('DESCRIPTION:' + 'a'.repeat(200));
    const lines = physicalLines(folded);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(octets(line)).toBeLessThanOrEqual(75);
    for (const line of lines.slice(1)) expect(line.startsWith(' ')).toBe(true);
    expect(unfold(folded)).toBe('DESCRIPTION:' + 'a'.repeat(200));
  });

  it('never splits a multi-byte code point', () => {
    // Em dashes are 3 octets each; 75 is not a multiple of 3 after the property name.
    const value = 'SUMMARY:' + '—'.repeat(60) + '🎸' + 'é'.repeat(40);
    const folded = foldIcsLine(value);
    for (const line of physicalLines(folded)) {
      expect(octets(line)).toBeLessThanOrEqual(75);
      // A split code point would produce replacement chars on decode; round-trip proves integrity.
      expect(Buffer.from(line, 'utf8').toString('utf8')).toBe(line);
    }
    expect(unfold(folded)).toBe(value);
  });
});

describe('serializeIcs', () => {
  it('joins lines with CRLF, folds long ones, and ends with CRLF', () => {
    const doc = serializeIcs(['BEGIN:VCALENDAR', 'DESCRIPTION:' + 'x'.repeat(100), 'END:VCALENDAR']);
    expect(doc.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(doc).not.toContain('\n\n');
    for (const line of doc.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });
});
