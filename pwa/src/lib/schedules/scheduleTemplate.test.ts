import { describe, it, expect } from 'vitest';
import {
  parseScheduleTemplate,
  scheduleTemplateCategoryLabel,
  templateItemInstant,
} from './scheduleTemplate';

describe('parseScheduleTemplate', () => {
  it('parses items with defaults and sorts them by order', () => {
    const t = parseScheduleTemplate('st1', {
      name: 'Load-in',
      category: 'production',
      createdBy: 'u1',
      items: [
        { id: 'b', section: 'production', title: 'Doors', order: 1 },
        { id: 'a', section: 'show', title: 'Headliner', slot: 1, order: 0 },
      ],
    });
    expect(t.name).toBe('Load-in');
    expect(t.category).toBe('production');
    expect(t.items.map((i) => i.id)).toEqual(['a', 'b']); // sorted by order
    expect(t.items[0].slot).toBe(1);
    expect(t.items[1].dayOffset).toBe(0); // default
    expect(t.items[1].includeInMaster).toBe(true); // default
  });

  it('rejects an unknown category', () => {
    expect(() => parseScheduleTemplate('x', { name: 'X', category: 'bogus', createdBy: 'u' })).toThrow();
  });
});

describe('scheduleTemplateCategoryLabel', () => {
  it('labels each category', () => {
    expect(scheduleTemplateCategoryLabel('show')).toBe('Show');
    expect(scheduleTemplateCategoryLabel('stagehand')).toBe('Stagehand');
  });
});

describe('templateItemInstant', () => {
  it('resolves day offset + wall-clock time to an instant on the right day', () => {
    const start = new Date(2026, 5, 26); // Fri Jun 26 (local calendar date)
    const day0 = templateItemInstant(start, 0, '21:00');
    const day2 = templateItemInstant(start, 2, '21:00');
    expect(day0).not.toBeNull();
    expect(day2).not.toBeNull();
    // Same wall-clock time, two days later, no DST boundary in June → exactly 2 days apart.
    expect(day2!.getTime() - day0!.getTime()).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('returns null without a start date or a time', () => {
    expect(templateItemInstant(null, 0, '21:00')).toBeNull();
    expect(templateItemInstant(new Date(2026, 5, 26), 0, null)).toBeNull();
  });
});
