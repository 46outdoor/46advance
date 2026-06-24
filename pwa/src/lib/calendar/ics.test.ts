import { describe, expect, it } from 'vitest';
import { buildIcs, icsFilename, type IcsEvent } from './ics';

const base: IcsEvent = {
  uid: 'advance-1@46advance',
  title: 'Advance call — Headliner',
  start: new Date(Date.UTC(2026, 6, 1, 17, 0, 0)), // 2026-07-01 17:00 UTC
  durationMinutes: 45,
  url: 'https://meet.google.com/abc-defg-hij',
};

describe('buildIcs', () => {
  it('wraps a single VEVENT in a VCALENDAR', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('emits UTC start/end with the duration applied', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('DTSTART:20260701T170000Z');
    expect(ics).toContain('DTEND:20260701T174500Z'); // +45 min
  });

  it('defaults the duration to 30 minutes', () => {
    const ics = buildIcs({ uid: 'x', title: 'T', start: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)) });
    expect(ics).toContain('DTSTART:20260101T000000Z');
    expect(ics).toContain('DTEND:20260101T003000Z');
  });

  it('includes the url as LOCATION and URL', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('LOCATION:https://meet.google.com/abc-defg-hij');
    expect(ics).toContain('URL:https://meet.google.com/abc-defg-hij');
  });

  it('escapes commas and semicolons in text', () => {
    const ics = buildIcs({ ...base, title: 'Call: A, B; C' });
    expect(ics).toContain('SUMMARY:Call: A\\, B\\; C');
  });

  it('uses CRLF line endings', () => {
    expect(buildIcs(base)).toContain('\r\n');
  });
});

describe('icsFilename', () => {
  it('slugifies the title', () => {
    expect(icsFilename('Advance call — Headliner')).toBe('advance-call-headliner.ics');
  });

  it('falls back to "event" for empty slugs', () => {
    expect(icsFilename('!!!')).toBe('event.ics');
  });
});
