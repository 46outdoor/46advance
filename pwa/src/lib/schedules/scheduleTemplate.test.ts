import { describe, it, expect } from 'vitest';
import {
  categoryDefaultSection,
  parseScheduleTemplate,
  scheduleTemplateCategoryLabel,
  templateDayLabel,
  templateItemInstant,
  wallClockHours,
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
    expect(t.items[1].endEstimated).toBe(false); // default
    expect(t.days).toEqual([]); // default
  });

  it('parses labeled days sorted by offset', () => {
    const t = parseScheduleTemplate('st2', {
      name: 'Labor',
      category: 'stagehand',
      createdBy: 'u1',
      days: [
        { offset: 0, label: 'Show Day 1' },
        { offset: -3, label: 'Stage Build Day 1 + Pre Rig' },
      ],
    });
    expect(t.days.map((d) => d.offset)).toEqual([-3, 0]);
    expect(t.days[0].label).toBe('Stage Build Day 1 + Pre Rig');
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

describe('categoryDefaultSection', () => {
  it('matches each category to its section, falling back to production for other', () => {
    expect(categoryDefaultSection('production')).toBe('production');
    expect(categoryDefaultSection('show')).toBe('show');
    expect(categoryDefaultSection('stagehand')).toBe('labor');
    expect(categoryDefaultSection('other')).toBe('production');
  });
});

describe('templateDayLabel', () => {
  it('labels load-in (negative) and show days', () => {
    expect(templateDayLabel(-2)).toBe('Load-in 2');
    expect(templateDayLabel(-1)).toBe('Load-in 1');
    expect(templateDayLabel(0)).toBe('Show day 1');
    expect(templateDayLabel(2)).toBe('Show day 3');
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

describe('wallClockHours', () => {
  it('computes hours between wall-clock times, wrapping overnight ends', () => {
    expect(wallClockHours('08:00', '18:00')).toBe(10);
    expect(wallClockHours('22:00', '02:00')).toBe(4); // overnight
    expect(wallClockHours('13:00', '22:30')).toBe(9.5);
  });

  it('returns null without both times or for a zero span', () => {
    expect(wallClockHours(null, '18:00')).toBeNull();
    expect(wallClockHours('08:00', null)).toBeNull();
    expect(wallClockHours('08:00', '08:00')).toBeNull();
  });
});
