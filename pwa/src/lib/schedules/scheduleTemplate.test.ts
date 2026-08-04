import { describe, it, expect } from 'vitest';
import {
  TEMPLATE_DAY_OFFSET_MAX,
  canDuplicateTemplateDay,
  composeTemplateDays,
  dayItemToTemplateItem,
  duplicateTemplateDay,
  parseScheduleTemplate,
  resolveTemplateDays,
  scheduleTemplateInputSchema,
  templateDayChipLabel,
  templateDayLabel,
  templateDaysToInput,
  templateItemCount,
  templateItemToDayItem,
  type ScheduleTemplate,
  type ScheduleTemplateDay,
  type ScheduleTemplateItem,
} from './scheduleTemplate';

const item = (id: string, over: Partial<ScheduleTemplateItem> = {}): ScheduleTemplateItem => ({
  id,
  type: 'labor',
  customLabel: null,
  startTime: '08:00',
  endTime: '18:00',
  endEstimated: false,
  nextDay: false,
  item: 'Crew Call',
  description: null,
  stageName: 'Main',
  fields: {},
  crew: [],
  pushToCalendar: true,
  ...over,
});

const day = (offset: number, items: ScheduleTemplateItem[] = [], title = ''): ScheduleTemplateDay => ({
  offset,
  dayType: 'loadIn',
  title: title || null,
  description: null,
  notes: null,
  items,
});

const template = (over: Partial<ScheduleTemplate>): ScheduleTemplate => ({
  id: 't1',
  name: 'T',
  kind: 'standard',
  category: 'stagehand',
  refs: [],
  isDefault: false,
  days: [],
  createdBy: 'u1',
  createdAt: null,
  updatedAt: null,
  ...over,
});

describe('parseScheduleTemplate', () => {
  it('parses a minimal doc with defaults (standard, no refs, days sorted by offset)', () => {
    const t = parseScheduleTemplate('t1', {
      name: 'Stagehand',
      category: 'stagehand',
      createdBy: 'u1',
      days: [
        { offset: 0, dayType: 'show' },
        { offset: -2, dayType: 'loadIn', items: [{ id: 'i1', type: 'labor', item: 'Crew Call' }] },
      ],
    });
    expect(t.kind).toBe('standard');
    expect(t.isDefault).toBe(false);
    expect(t.days.map((d) => d.offset)).toEqual([-2, 0]);
    expect(t.days[0].items[0].stageName).toBeNull();
    expect(t.days[0].items[0].pushToCalendar).toBe(true);
  });

  it('parses a master with refs + isDefault; rejects unknown kind or dayType', () => {
    const t = parseScheduleTemplate('m1', {
      name: 'Master',
      kind: 'master',
      category: 'other',
      refs: ['a', 'b'],
      isDefault: true,
      createdBy: 'u1',
    });
    expect(t.kind).toBe('master');
    expect(t.refs).toEqual(['a', 'b']);
    expect(t.isDefault).toBe(true);
    expect(() =>
      parseScheduleTemplate('x', { name: 'X', kind: 'mega', category: 'other', createdBy: 'u1' }),
    ).toThrow();
    expect(() =>
      parseScheduleTemplate('x', {
        name: 'X',
        category: 'other',
        createdBy: 'u1',
        days: [{ offset: 0, dayType: 'build' }],
      }),
    ).toThrow();
  });
});

describe('composeTemplateDays (decision 14: merge by offset)', () => {
  it('keeps metadata from the first source defining an offset; later sources add items', () => {
    const merged = composeTemplateDays([
      [day(-1, [item('a')], 'Rig Day')],
      [day(-1, [item('b')], 'Ignored Title'), day(0, [item('c')])],
    ]);
    expect(merged.map((d) => d.offset)).toEqual([-1, 0]);
    expect(merged[0].title).toBe('Rig Day');
    expect(merged[0].items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('does not mutate its sources', () => {
    const src = day(-1, [item('a')]);
    composeTemplateDays([[src], [day(-1, [item('b')])]]);
    expect(src.items.map((i) => i.id)).toEqual(['a']);
  });
});

describe('resolveTemplateDays', () => {
  const std = template({ id: 's1', days: [day(-1, [item('a')])] });

  it('returns a standard template’s own days', () => {
    expect(resolveTemplateDays(std, new Map())).toEqual(std.days);
  });

  it('composes a master: inline days first, then refs in order; skips missing/master refs', () => {
    const other = template({ id: 's2', days: [day(-1, [item('b')]), day(0, [item('c')])] });
    const nestedMaster = template({ id: 'm2', kind: 'master', days: [day(5, [item('z')])] });
    const master = template({
      id: 'm1',
      kind: 'master',
      refs: ['s1', 'missing', 's2', 'm2'],
      days: [day(-1, [], 'Master Rig Day')],
    });
    const byId = new Map([
      ['s1', std],
      ['s2', other],
      ['m2', nestedMaster],
    ]);
    const resolved = resolveTemplateDays(master, byId);
    expect(resolved.map((d) => d.offset)).toEqual([-1, 0]);
    expect(resolved[0].title).toBe('Master Rig Day');
    expect(resolved[0].items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(resolved.some((d) => d.offset === 5)).toBe(false);
  });
});

describe('duplicateTemplateDay', () => {
  it('copies metadata and items onto the next offset, minting fresh item ids', () => {
    const src = day(0, [item('a'), item('b')], 'Rig Day');
    const result = duplicateTemplateDay([src], 0);
    expect(result?.map((d) => d.offset)).toEqual([0, 1]);
    const copy = result![1];
    expect(copy.dayType).toBe(src.dayType);
    expect(copy.title).toBe('Rig Day');
    expect(copy.items.map((i) => i.item)).toEqual(['Crew Call', 'Crew Call']);
    const ids = new Set([...src.items, ...copy.items].map((i) => i.id));
    expect(ids.size).toBe(4);
  });

  it('skips taken offsets and returns the list sorted', () => {
    const result = duplicateTemplateDay([day(1), day(0, [item('a')])], 0);
    expect(result?.map((d) => d.offset)).toEqual([0, 1, 2]);
    expect(result?.[2].items).toHaveLength(1);
  });

  it('does not alias fields/crew between source and copy', () => {
    const src = day(0, [
      item('a', { fields: { location: 'FOH' }, crew: [{ type: 'Hands', quantity: 4, hours: 8 }] }),
    ]);
    const copyItem = duplicateTemplateDay([src], 0)![1].items[0];
    expect(copyItem.fields).toEqual({ location: 'FOH' });
    expect(copyItem.fields).not.toBe(src.items[0].fields);
    expect(copyItem.crew[0]).toEqual(src.items[0].crew[0]);
    expect(copyItem.crew[0]).not.toBe(src.items[0].crew[0]);
  });

  it('returns null for a missing source or when every offset through the max is taken', () => {
    expect(duplicateTemplateDay([day(0)], 5)).toBeNull();
    expect(canDuplicateTemplateDay([day(0)], 5)).toBe(false);
    const full = Array.from({ length: TEMPLATE_DAY_OFFSET_MAX + 1 }, (_, o) => day(o));
    expect(duplicateTemplateDay(full, 0)).toBeNull();
    expect(canDuplicateTemplateDay(full, 0)).toBe(false);
    expect(canDuplicateTemplateDay([day(0)], 0)).toBe(true);
  });
});

describe('editor bridges + helpers', () => {
  it('round-trips an item through the day-item view (stage name ⇄ stage "id")', () => {
    const original = item('i1');
    const asDay = templateItemToDayItem(original);
    expect(asDay.stageId).toBe('Main');
    expect(asDay.googleCalendarEventId).toBeNull();
    expect(dayItemToTemplateItem(asDay)).toEqual(original);
  });

  it('labels offsets by day type and counts items', () => {
    expect(templateDayLabel(0, 'show')).toBe('Show day 1');
    expect(templateDayLabel(2, 'show')).toBe('Show day 3');
    expect(templateDayLabel(-2, 'loadIn')).toBe('Day -2');
    expect(templateDayLabel(2, 'loadOut')).toBe('Day +2');
    expect(templateItemCount(template({ days: [day(0, [item('a'), item('b')]), day(1, [item('c')])] }))).toBe(3);
  });

  it('chip labels count load-in days UP from the earliest one', () => {
    const days = [
      { offset: -4, dayType: 'travel' as const },
      { offset: -3, dayType: 'loadIn' as const },
      { offset: -1, dayType: 'loadIn' as const },
      { offset: 0, dayType: 'show' as const },
      { offset: 2, dayType: 'loadOut' as const },
    ];
    expect(days.map((d) => templateDayChipLabel(d, days))).toEqual([
      'Day -4',
      'Load-in day 1',
      'Load-in day 2',
      'Show day 1',
      'Day +2',
    ]);
  });

  it('serializes parsed days to the input shape (nulls become omitted optionals)', () => {
    const input = templateDaysToInput([day(-1, [item('a')], 'Rig Day')]);
    expect(input).toHaveLength(1);
    expect(input[0].offset).toBe(-1);
    expect(input[0].title).toBe('Rig Day');
    expect(input[0].description).toBeUndefined();
    expect(input[0].items?.[0]).toMatchObject({ id: 'a', stageName: 'Main', item: 'Crew Call' });
    // The round trip is schema-valid.
    expect(
      scheduleTemplateInputSchema.safeParse({ name: 'T', kind: 'standard', category: 'stagehand', days: input })
        .success,
    ).toBe(true);
  });

  it('input schema requires a name and known kind/category', () => {
    expect(scheduleTemplateInputSchema.safeParse({ name: 'T', kind: 'standard', category: 'show' }).success).toBe(true);
    expect(scheduleTemplateInputSchema.safeParse({ name: ' ', kind: 'standard', category: 'show' }).success).toBe(false);
    expect(scheduleTemplateInputSchema.safeParse({ name: 'T', kind: 'nope', category: 'show' }).success).toBe(false);
  });

  it('master-only fields: input rejects them on a standard; parse normalizes them away', () => {
    expect(
      scheduleTemplateInputSchema.safeParse({ name: 'T', kind: 'standard', category: 'show', refs: ['x'] }).success,
    ).toBe(false);
    expect(
      scheduleTemplateInputSchema.safeParse({ name: 'T', kind: 'standard', category: 'show', isDefault: true })
        .success,
    ).toBe(false);
    expect(
      scheduleTemplateInputSchema.safeParse({ name: 'T', kind: 'master', category: 'other', refs: ['x'], isDefault: true })
        .success,
    ).toBe(true);
    const parsed = parseScheduleTemplate('t', {
      name: 'T',
      category: 'show',
      createdBy: 'u1',
      refs: ['stale'],
      isDefault: true,
    });
    expect(parsed.refs).toEqual([]);
    expect(parsed.isDefault).toBe(false);
  });
});
