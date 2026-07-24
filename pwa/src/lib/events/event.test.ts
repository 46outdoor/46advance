import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { composeEventName, eventDays, eventInputSchema, parseEvent } from './event';
import { dayKeyToInstant, zonedDayKey } from '@/lib/dates/timezone';

describe('parseEvent', () => {
  it('normalizes timestamps and passes through fields', () => {
    const e = parseEvent('evt-1', {
      name: 'Summerfest 2026',
      status: 'active',
      createdBy: 'admin-1',
      startDate: Timestamp.fromDate(new Date('2026-07-01T00:00:00Z')),
      venue: 'Riverside Park',
    });
    expect(e.id).toBe('evt-1');
    expect(e.name).toBe('Summerfest 2026');
    expect(e.status).toBe('active');
    expect(e.startDate?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(e.endDate).toBeNull();
    expect(e.venue).toBe('Riverside Park');
    expect(e.timeZone).toBe('America/Chicago'); // default
    expect(e.shortCode).toBeNull(); // defaults to null when absent
  });

  it('parses a short code when present', () => {
    const e = parseEvent('evt-2', {
      name: 'Battle of the Bands',
      status: 'active',
      createdBy: 'admin-1',
      shortCode: 'BOTB',
    });
    expect(e.shortCode).toBe('BOTB');
  });

  it('rejects an unknown status', () => {
    expect(() => parseEvent('x', { name: 'X', status: 'live', createdBy: 'a' })).toThrow();
  });

  it('defaults packetDrive to null, and parses it when present', () => {
    expect(parseEvent('x', { name: 'X', status: 'active', createdBy: 'a' }).packetDrive).toBeNull();
    const saved = Timestamp.fromDate(new Date('2026-07-24T20:40:00Z'));
    const e = parseEvent('evt-3', {
      name: 'RTC',
      status: 'active',
      createdBy: 'admin-1',
      packetDrive: { fileId: 'file-1', webViewLink: 'https://drive/x', savedAt: saved },
    });
    expect(e.packetDrive).toEqual({
      fileId: 'file-1',
      webViewLink: 'https://drive/x',
      savedAt: saved.toDate(),
    });
  });

  it('uses an explicit timezone when set', () => {
    const e = parseEvent('x', { name: 'X', status: 'active', createdBy: 'a', timeZone: 'America/Los_Angeles' });
    expect(e.timeZone).toBe('America/Los_Angeles');
  });
});

describe('composeEventName', () => {
  const tz = 'America/Chicago';
  const start = new Date('2026-07-10T12:00:00Z');

  it('composes "{festival} {year} — {location}"', () => {
    expect(composeEventName('Rock the Country', start, 'Ashland', tz)).toBe(
      'Rock the Country 2026 — Ashland',
    );
  });

  it('drops the location when empty', () => {
    expect(composeEventName('RTC', start, '  ', tz)).toBe('RTC 2026');
  });

  it('drops the year when there is no start date', () => {
    expect(composeEventName('RTC', null, 'Ashland', tz)).toBe('RTC — Ashland');
  });
});

describe('eventInputSchema', () => {
  it('requires a name', () => {
    expect(() => eventInputSchema.parse({ name: '  ' })).toThrow();
  });

  it('rejects an end date before the start date', () => {
    const start = new Date('2026-07-10');
    const end = new Date('2026-07-01');
    expect(() => eventInputSchema.parse({ name: 'E', startDate: start, endDate: end })).toThrow();
    expect(eventInputSchema.parse({ name: 'E', startDate: end, endDate: start })).toBeTruthy();
  });
});

describe('eventDays', () => {
  // A non-Central event zone proves the days derive from the EVENT zone, not the test runner's.
  const TZ = 'America/Los_Angeles';

  it('lists each calendar day from start to end inclusive, in the event zone', () => {
    const days = eventDays(dayKeyToInstant('2026-06-26', TZ), dayKeyToInstant('2026-06-28', TZ), TZ); // Fri–Sun
    expect(days.map((d) => zonedDayKey(d, TZ))).toEqual(['2026-06-26', '2026-06-27', '2026-06-28']);
  });

  it('returns a single day when end is null', () => {
    expect(eventDays(dayKeyToInstant('2026-06-26', TZ), null, TZ)).toHaveLength(1);
  });

  it('returns [] when there is no start', () => {
    expect(eventDays(null, null, TZ)).toEqual([]);
  });
});

