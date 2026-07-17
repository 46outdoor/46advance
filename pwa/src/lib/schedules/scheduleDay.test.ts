import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  itemDurationLabel,
  parseScheduleDay,
  resolveArtistPlaceholders,
  scheduleDayInputSchema,
  scheduleDayItemInputSchema,
  crewLineInputSchema,
  sortDayItems,
  type ScheduleDayItem,
  type ScheduleDayInput,
  type ScheduleDayItemInput,
} from './scheduleDay';

const minimalItem = { id: 'i1', type: 'production', item: 'Load-in call' };

describe('parseScheduleDay', () => {
  it('parses a minimal doc with defaults', () => {
    const day = parseScheduleDay('2026-07-14', { date: '2026-07-14', dayType: 'loadIn', createdBy: 'u1' });
    expect(day.id).toBe('2026-07-14');
    expect(day.date).toBe('2026-07-14');
    expect(day.dayType).toBe('loadIn');
    expect(day.title).toBeNull();
    expect(day.description).toBeNull();
    expect(day.notes).toBeNull();
    expect(day.items).toEqual([]);
    expect(day.createdAt).toBeNull();
  });

  it('normalizes item defaults (pushToCalendar on, empty fields/crew, null optionals)', () => {
    const day = parseScheduleDay('2026-07-14', {
      date: '2026-07-14',
      dayType: 'loadIn',
      createdBy: 'u1',
      items: [minimalItem],
    });
    const item = day.items[0];
    expect(item.pushToCalendar).toBe(true);
    expect(item.fields).toEqual({});
    expect(item.crew).toEqual([]);
    expect(item.startTime).toBeNull();
    expect(item.endEstimated).toBe(false);
    expect(item.stageId).toBeNull();
    expect(item.googleCalendarEventId).toBeNull();
  });

  it('parses a full labor item with crew lines (missing hours coalesce to null)', () => {
    const day = parseScheduleDay('2026-07-14', {
      date: '2026-07-14',
      dayType: 'loadIn',
      createdBy: 'u1',
      createdAt: Timestamp.fromMillis(Date.UTC(2026, 6, 1)),
      items: [
        {
          ...minimalItem,
          type: 'labor',
          startTime: '08:00',
          endTime: '18:00',
          endEstimated: true,
          crew: [
            { type: 'Stagehands', quantity: 24, hours: 10 },
            { type: 'Riggers / Climbers', quantity: 6 },
          ],
        },
      ],
    });
    expect(day.createdAt?.getTime()).toBe(Date.UTC(2026, 6, 1));
    expect(day.items[0].crew).toEqual([
      { type: 'Stagehands', quantity: 24, hours: 10 },
      { type: 'Riggers / Climbers', quantity: 6, hours: null },
    ]);
  });

  it('preserves item array order (authoring order is the tie-break)', () => {
    const day = parseScheduleDay('2026-07-14', {
      date: '2026-07-14',
      dayType: 'show',
      createdBy: 'u1',
      items: [
        { id: 'b', type: 'show', item: 'Second' },
        { id: 'a', type: 'show', item: 'First' },
      ],
    });
    expect(day.items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('rejects a bad date key, unknown day type, or unknown item type', () => {
    expect(() => parseScheduleDay('x', { date: 'July 14', dayType: 'show', createdBy: 'u1' })).toThrow();
    expect(() => parseScheduleDay('x', { date: '2026-07-14', dayType: 'build', createdBy: 'u1' })).toThrow();
    expect(() =>
      parseScheduleDay('x', {
        date: '2026-07-14',
        dayType: 'show',
        createdBy: 'u1',
        items: [{ ...minimalItem, type: 'section' }],
      }),
    ).toThrow();
  });

  it('rejects a missing createdBy or an item without a name', () => {
    expect(() => parseScheduleDay('x', { date: '2026-07-14', dayType: 'show' })).toThrow();
    expect(() =>
      parseScheduleDay('x', {
        date: '2026-07-14',
        dayType: 'show',
        createdBy: 'u1',
        items: [{ id: 'i1', type: 'production', item: '' }],
      }),
    ).toThrow();
  });

  it('rejects malformed stored times and non-positive crew quantities (fail loud, not blank)', () => {
    expect(() =>
      parseScheduleDay('x', {
        date: '2026-07-14',
        dayType: 'show',
        createdBy: 'u1',
        items: [{ ...minimalItem, startTime: '8am' }],
      }),
    ).toThrow();
    expect(() =>
      parseScheduleDay('x', {
        date: '2026-07-14',
        dayType: 'show',
        createdBy: 'u1',
        items: [{ ...minimalItem, type: 'labor', crew: [{ type: 'Stagehands', quantity: 0 }] }],
      }),
    ).toThrow();
  });
});

describe('input schemas', () => {
  it('accepts a valid day and rejects a non-date key', () => {
    const day: ScheduleDayInput = { date: '2026-07-14', dayType: 'loadIn' };
    expect(scheduleDayInputSchema.safeParse(day).success).toBe(true);
    expect(scheduleDayInputSchema.safeParse({ ...day, date: '07/14/2026' }).success).toBe(false);
  });

  it('item input requires a name and valid wall-clock times', () => {
    const ok: ScheduleDayItemInput = { id: 'i1', type: 'production', item: 'Doors', startTime: '17:30', endTime: null };
    expect(scheduleDayItemInputSchema.safeParse(ok).success).toBe(true);
    expect(scheduleDayItemInputSchema.safeParse({ ...ok, item: '  ' }).success).toBe(false);
    expect(scheduleDayItemInputSchema.safeParse({ ...ok, startTime: '25:00' }).success).toBe(false);
    expect(scheduleDayItemInputSchema.safeParse({ ...ok, startTime: '9:5' }).success).toBe(false);
  });

  it('crew lines require a type and a positive integer quantity; hours optional-positive', () => {
    expect(crewLineInputSchema.safeParse({ type: 'Stagehands', quantity: 12, hours: 8 }).success).toBe(true);
    expect(crewLineInputSchema.safeParse({ type: 'Stagehands', quantity: 12, hours: null }).success).toBe(true);
    expect(crewLineInputSchema.safeParse({ type: '', quantity: 12 }).success).toBe(false);
    expect(crewLineInputSchema.safeParse({ type: 'Stagehands', quantity: 0 }).success).toBe(false);
    expect(crewLineInputSchema.safeParse({ type: 'Stagehands', quantity: 2.5 }).success).toBe(false);
    expect(crewLineInputSchema.safeParse({ type: 'Stagehands', quantity: 4, hours: -1 }).success).toBe(false);
  });
});

describe('itemDurationLabel (decision 17)', () => {
  const labor = (crew: ScheduleDayItem['crew']): Pick<ScheduleDayItem, 'type' | 'startTime' | 'endTime' | 'crew'> => ({
    type: 'labor',
    startTime: '08:00',
    endTime: '18:00',
    crew,
  });

  it('shows the shared duration when every crew line agrees', () => {
    expect(itemDurationLabel(labor([{ type: 'SH', quantity: 12, hours: 8 }, { type: 'RG', quantity: 4, hours: 8 }]))).toBe('8h');
  });

  it('stays blank when crew lines differ (per-line durations carry the truth)', () => {
    expect(itemDurationLabel(labor([{ type: 'SH', quantity: 12, hours: 10 }, { type: 'RG', quantity: 4, hours: 4 }]))).toBeNull();
    expect(itemDurationLabel(labor([{ type: 'SH', quantity: 12, hours: 10 }, { type: 'RG', quantity: 4, hours: null }]))).toBeNull();
  });

  it('falls back to the item window when no line carries hours (or there is no crew)', () => {
    expect(itemDurationLabel(labor([{ type: 'SH', quantity: 12, hours: null }]))).toBe('10h');
    expect(itemDurationLabel(labor([]))).toBe('10h');
  });

  it('derives from start/end for non-labor items; blank when untimed', () => {
    expect(itemDurationLabel({ type: 'production', startTime: '07:00', endTime: '08:00', crew: [] })).toBe('1h');
    expect(itemDurationLabel({ type: 'production', startTime: null, endTime: null, crew: [] })).toBeNull();
  });
});

describe('sortDayItems', () => {
  it('sorts by start time with untimed last, keeping authoring order on ties', () => {
    const items = [
      { id: 'untimed', startTime: null },
      { id: 'late', startTime: '18:00' },
      { id: 'tie-1', startTime: '08:00' },
      { id: 'tie-2', startTime: '08:00' },
    ];
    expect(sortDayItems(items).map((i) => i.id)).toEqual(['tie-1', 'tie-2', 'late', 'untimed']);
  });
});

describe('resolveArtistPlaceholders', () => {
  const resolve = (slot: number) => (slot === 1 ? 'Jelly Roll' : null);

  it('replaces resolvable placeholders with the booked artist', () => {
    expect(resolveArtistPlaceholders('{artist 1} set', resolve)).toBe('Jelly Roll set');
  });

  it('renders unbooked slots as the canonical lineup slot label; case-insensitive', () => {
    expect(resolveArtistPlaceholders('{Artist 2} soundcheck', resolve)).toBe('Direct Support soundcheck');
    expect(resolveArtistPlaceholders('{artist 1} set', () => null)).toBe('Headliner set');
    expect(resolveArtistPlaceholders('{artist 4} set', resolve)).toBe('Artist 4 set');
  });

  it('falls back on a blank resolution too (empty artist name never renders a gap)', () => {
    expect(resolveArtistPlaceholders('{artist 1} set', () => '')).toBe('Headliner set');
  });

  it('handles multiple placeholders in one string and leaves plain text alone', () => {
    expect(resolveArtistPlaceholders('{artist 1} then {artist 2}', resolve)).toBe('Jelly Roll then Direct Support');
    expect(resolveArtistPlaceholders('Doors', resolve)).toBe('Doors');
  });
});
