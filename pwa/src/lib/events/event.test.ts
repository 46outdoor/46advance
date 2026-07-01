import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { zonedInputToDate } from '@/lib/dates/timezone';
import { eventDays, eventScheduleDays, eventInputSchema, parseEvent } from './event';

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
  });

  it('rejects an unknown status', () => {
    expect(() => parseEvent('x', { name: 'X', status: 'live', createdBy: 'a' })).toThrow();
  });

  it('uses an explicit timezone when set', () => {
    const e = parseEvent('x', { name: 'X', status: 'active', createdBy: 'a', timeZone: 'America/Los_Angeles' });
    expect(e.timeZone).toBe('America/Los_Angeles');
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
  it('lists each calendar day from start to end inclusive', () => {
    const days = eventDays(new Date(2026, 5, 26), new Date(2026, 5, 28)); // Fri–Sun
    expect(days.map((d) => d.getDate())).toEqual([26, 27, 28]);
  });

  it('returns a single day when end is null', () => {
    expect(eventDays(new Date(2026, 5, 26), null)).toHaveLength(1);
  });

  it('returns [] when there is no start', () => {
    expect(eventDays(null, null)).toEqual([]);
    expect(eventDays()).toEqual([]);
  });
});

describe('eventScheduleDays', () => {
  const tz = 'America/Chicago';
  // Noon in the event zone → an unambiguous calendar day regardless of the test machine's zone.
  const at = (ymd: string): Date => zonedInputToDate(`${ymd}T12:00`, tz)!;

  it('spans load-in → show → load-out, tagged by kind, in the event timezone', () => {
    const days = eventScheduleDays(at('2026-06-26'), at('2026-06-28'), 1, 1, tz); // Fri–Sun show
    expect(days.map((d) => d.kind)).toEqual(['load-in', 'show', 'show', 'show', 'load-out']);
    expect(days.map((d) => d.key)).toEqual([
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
      '2026-06-28',
      '2026-06-29',
    ]);
  });

  it('derives the day in the event zone, not the browser zone', () => {
    // An instant at 00:30 UTC on 6/27 is still 6/26 in Central (UTC−5) — the day key must be 6/26.
    const days = eventScheduleDays(new Date('2026-06-27T00:30:00Z'), new Date('2026-06-27T00:30:00Z'), 0, 0, tz);
    expect(days.map((d) => d.key)).toEqual(['2026-06-26']);
  });

  it('is just the show days with no load-in/out, and empty without a start', () => {
    expect(eventScheduleDays(at('2026-06-26'), at('2026-06-26'), 0, 0, tz).map((d) => d.kind)).toEqual(['show']);
    expect(eventScheduleDays(null)).toEqual([]);
  });
});
