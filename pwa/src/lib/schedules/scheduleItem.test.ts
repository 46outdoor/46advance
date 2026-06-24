import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { parseScheduleItem, scheduleItemInputSchema } from './scheduleItem';

describe('scheduleItem', () => {
  it('parses a minimal doc with defaults', () => {
    const item = parseScheduleItem('s1', { section: 'production', title: 'Load-in', createdBy: 'u1' });
    expect(item.section).toBe('production');
    expect(item.title).toBe('Load-in');
    expect(item.includeInMaster).toBe(true);
    expect(item.fields).toEqual({});
    expect(item.startAt).toBeNull();
    expect(item.stageId).toBeNull();
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
});
