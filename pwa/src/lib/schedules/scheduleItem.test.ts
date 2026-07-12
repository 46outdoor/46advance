import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { itemHours, parseScheduleItem, scheduleItemInputSchema } from './scheduleItem';

describe('scheduleItem', () => {
  it('parses a minimal doc with defaults', () => {
    const item = parseScheduleItem('s1', { section: 'production', title: 'Load-in', createdBy: 'u1' });
    expect(item.section).toBe('production');
    expect(item.title).toBe('Load-in');
    expect(item.includeInMaster).toBe(true);
    expect(item.fields).toEqual({});
    expect(item.startAt).toBeNull();
    expect(item.stageId).toBeNull();
    expect(item.slot).toBeNull();
  });

  it('parses times (UTC) + section fields', () => {
    const item = parseScheduleItem('s2', {
      section: 'travel',
      title: 'Flight',
      createdBy: 'u1',
      startAt: Timestamp.fromMillis(Date.UTC(2026, 5, 24, 21, 0)),
      fields: { mode: 'Flight', carrier: 'AA' },
      includeInMaster: false,
    });
    expect(item.startAt?.getTime()).toBe(Date.UTC(2026, 5, 24, 21, 0));
    expect(item.fields.mode).toBe('Flight');
    expect(item.includeInMaster).toBe(false);
  });

  it('rejects an invalid section or missing title', () => {
    expect(() => parseScheduleItem('s3', { section: 'nope', title: 'x', createdBy: 'u1' })).toThrow();
    expect(() => parseScheduleItem('s4', { section: 'show', createdBy: 'u1' })).toThrow();
  });

  it('input schema requires section + non-empty title', () => {
    expect(scheduleItemInputSchema.safeParse({ section: 'show', title: 'Set' }).success).toBe(true);
    expect(scheduleItemInputSchema.safeParse({ section: 'show', title: '' }).success).toBe(false);
    expect(scheduleItemInputSchema.safeParse({ section: 'bogus', title: 'x' }).success).toBe(false);
  });

  it('carries a Show lineup slot (placeholder that resolves to the assigned artist)', () => {
    expect(parseScheduleItem('s5', { section: 'show', title: 'Headliner', createdBy: 'u1', slot: 1 }).slot).toBe(1);
    expect(scheduleItemInputSchema.safeParse({ section: 'show', title: 'Set', slot: 3 }).success).toBe(true);
  });

  it('input schema rejects an end time before its start (overnight must roll to next day first)', () => {
    const start = new Date('2026-06-26T22:00:00Z');
    const before = new Date('2026-06-26T02:00:00Z'); // earlier same day — invalid
    const after = new Date('2026-06-27T02:00:00Z'); // rolled to next day — valid
    expect(scheduleItemInputSchema.safeParse({ section: 'show', title: 'Set', startAt: start, endAt: before }).success).toBe(false);
    expect(scheduleItemInputSchema.safeParse({ section: 'show', title: 'Set', startAt: start, endAt: after }).success).toBe(true);
    // Equal is allowed (zero-length); a null end is allowed.
    expect(scheduleItemInputSchema.safeParse({ section: 'show', title: 'Set', startAt: start, endAt: start }).success).toBe(true);
    expect(scheduleItemInputSchema.safeParse({ section: 'show', title: 'Set', startAt: start, endAt: null }).success).toBe(true);
  });
});

describe('endEstimated', () => {
  it('defaults to false on parse and accepts a boolean input', () => {
    expect(parseScheduleItem('s6', { section: 'labor', title: 'Call', createdBy: 'u1' }).endEstimated).toBe(false);
    expect(parseScheduleItem('s7', { section: 'labor', title: 'Call', createdBy: 'u1', endEstimated: true }).endEstimated).toBe(true);
    expect(scheduleItemInputSchema.safeParse({ section: 'labor', title: 'Call', endEstimated: true }).success).toBe(true);
  });
});

describe('itemHours', () => {
  it('computes the call duration in hours (2-dp)', () => {
    expect(itemHours(new Date('2026-07-10T08:00:00Z'), new Date('2026-07-10T18:00:00Z'))).toBe(10);
    expect(itemHours(new Date('2026-07-10T22:00:00Z'), new Date('2026-07-11T02:00:00Z'))).toBe(4);
    expect(itemHours(new Date('2026-07-10T13:00:00Z'), new Date('2026-07-10T22:30:00Z'))).toBe(9.5);
  });

  it('returns null without both times or for a non-positive span', () => {
    const t = new Date('2026-07-10T08:00:00Z');
    expect(itemHours(null, t)).toBeNull();
    expect(itemHours(t, null)).toBeNull();
    expect(itemHours(t, t)).toBeNull();
  });
});
