import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { eventDays, eventInputSchema, parseEvent } from './event';

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
  });

  it('rejects an unknown status', () => {
    expect(() => parseEvent('x', { name: 'X', status: 'live', createdBy: 'a' })).toThrow();
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
