import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  dayItemSignature,
  itemDurationLabel,
  matchItemsBySignature,
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
    expect(day.revision).toBe(0); // absent on pre-S12 docs → treated as 0 (WS-G)
  });

  it('reads the revision counter when present', () => {
    const day = parseScheduleDay('2026-07-14', {
      date: '2026-07-14', dayType: 'show', createdBy: 'u1', revision: 5,
    });
    expect(day.revision).toBe(5);
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

  it('enforces the id == date invariant (one card per date)', () => {
    expect(() =>
      parseScheduleDay('2026-07-15', { date: '2026-07-14', dayType: 'show', createdBy: 'u1' }),
    ).toThrow(/must equal its date/);
  });

  it('rejects an impossible calendar date (regex-valid but rolls over)', () => {
    expect(() => parseScheduleDay('2026-02-31', { date: '2026-02-31', dayType: 'show', createdBy: 'u1' })).toThrow();
    expect(scheduleDayInputSchema.safeParse({ date: '2026-02-31', dayType: 'show' }).success).toBe(false);
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
    // A line without hours runs the 10h item window — 4h vs 10h differs.
    expect(itemDurationLabel(labor([{ type: 'RG', quantity: 4, hours: 4 }, { type: 'SH', quantity: 12, hours: null }]))).toBeNull();
  });

  it('treats a line without hours as running the item window (agreeing lines still show)', () => {
    // 10h line + no-hours line on a 10h window agree → show.
    expect(itemDurationLabel(labor([{ type: 'SH', quantity: 12, hours: 10 }, { type: 'RG', quantity: 4, hours: null }]))).toBe('10h');
    expect(itemDurationLabel(labor([{ type: 'SH', quantity: 12, hours: null }]))).toBe('10h');
    expect(itemDurationLabel(labor([]))).toBe('10h');
  });

  it('stays blank for an untimed item whose lines lack hours', () => {
    expect(
      itemDurationLabel({ type: 'labor', startTime: null, endTime: null, crew: [{ type: 'SH', quantity: 2, hours: null }] }),
    ).toBeNull();
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

  it('sorts "+1" (next-day AM) rows after every same-day time, before untimed', () => {
    const items = [
      { id: 'untimed-eod', startTime: null, nextDay: true },
      { id: 'reset+1', startTime: '01:00', nextDay: true },
      { id: 'load-outs', startTime: '23:00' },
      { id: 'breakfast', startTime: '05:00' },
    ];
    expect(sortDayItems(items).map((i) => i.id)).toEqual(['breakfast', 'load-outs', 'reset+1', 'untimed-eod']);
  });
});

describe('resolveArtistPlaceholders', () => {
  // Stage 0 (main): slot 1 booked. Stage 1 (side / 'b'): slot 1 booked.
  const resolve = (stage: number, slot: number) => {
    if (stage === 0 && slot === 1) return 'Jelly Roll';
    if (stage === 1 && slot === 1) return 'Side Headliner';
    return null;
  };

  it('replaces resolvable placeholders — underscore and legacy space forms hit the main stage', () => {
    expect(resolveArtistPlaceholders('{artist_1} set', resolve)).toBe('Jelly Roll set');
    expect(resolveArtistPlaceholders('{artist 1} set', resolve)).toBe('Jelly Roll set');
  });

  it('a stage letter picks the lineup by stage order — b is the second stage', () => {
    expect(resolveArtistPlaceholders('{artist_b_1} set', resolve)).toBe('Side Headliner set');
    expect(resolveArtistPlaceholders('{artist_a_1} set', resolve)).toBe('Jelly Roll set');
    // Space-separated letter form is accepted too.
    expect(resolveArtistPlaceholders('{artist b 1} set', resolve)).toBe('Side Headliner set');
    // A letter past the event's stages falls back to the slot label.
    expect(resolveArtistPlaceholders('{artist_c_1} set', resolve)).toBe('Headliner set');
  });

  it('renders unbooked slots as the canonical lineup slot label; case-insensitive', () => {
    expect(resolveArtistPlaceholders('{Artist 2} soundcheck', resolve)).toBe('Direct Support soundcheck');
    expect(resolveArtistPlaceholders('{Artist_B_2} soundcheck', resolve)).toBe('Direct Support soundcheck');
    expect(resolveArtistPlaceholders('{artist_1} set', () => null)).toBe('Headliner set');
    expect(resolveArtistPlaceholders('{artist_4} set', resolve)).toBe('Artist 4 set');
    expect(resolveArtistPlaceholders('{artist_12} set', resolve)).toBe('Artist 12 set');
  });

  it('falls back on a blank resolution too (empty artist name never renders a gap)', () => {
    expect(resolveArtistPlaceholders('{artist_1} set', () => '')).toBe('Headliner set');
  });

  it('handles multiple placeholders in one string; plain and malformed text stay put', () => {
    expect(resolveArtistPlaceholders('{artist_1} then {artist_b_1}', resolve)).toBe(
      'Jelly Roll then Side Headliner',
    );
    expect(resolveArtistPlaceholders('Doors', resolve)).toBe('Doors');
    expect(resolveArtistPlaceholders('{artist_bb_1}', resolve)).toBe('{artist_bb_1}');
  });
});

describe('dayItemSignature + matchItemsBySignature (template-import dedupe)', () => {
  const sigItem = (over: Partial<ScheduleDayItem> = {}): ScheduleDayItem => ({
    id: 'x',
    type: 'production',
    customLabel: null,
    startTime: '08:00',
    endTime: null,
    endEstimated: false,
    nextDay: false,
    item: 'Crew Call',
    description: null,
    stageId: null,
    fields: {},
    crew: [],
    pushToCalendar: true,
    ...over,
  });

  it('matches on identity, ignoring free-text details (description/fields/crew) and ids', () => {
    const existing = [sigItem({ id: 'a', description: 'old note', crew: [{ type: 'Hands', quantity: 4, hours: 8 }] })];
    const incoming = [sigItem({ id: 'b', description: 'new note', fields: { location: 'FOH' } })];
    const { fresh, matched } = matchItemsBySignature(existing, incoming);
    expect(fresh).toEqual([]);
    expect(matched).toHaveLength(1);
    expect(matched[0].existing.id).toBe('a');
    expect(matched[0].incoming.id).toBe('b');
  });

  it('is case- and whitespace-insensitive on the item name', () => {
    expect(dayItemSignature(sigItem({ item: '  crew   CALL ' }))).toBe(dayItemSignature(sigItem()));
  });

  it('treats different time, stage, or nextDay as a different row', () => {
    const base = sigItem();
    for (const variant of [
      sigItem({ startTime: '09:00' }),
      sigItem({ endTime: '17:00' }),
      sigItem({ stageId: 's1' }),
      sigItem({ nextDay: true }),
      sigItem({ item: 'Doors' }),
    ]) {
      expect(dayItemSignature(variant)).not.toBe(dayItemSignature(base));
    }
  });

  it('counts the custom label only on custom-type rows, normalized like the name', () => {
    const a = sigItem({ type: 'custom', customLabel: 'Pyro' });
    const b = sigItem({ type: 'custom', customLabel: 'Rehearsal' });
    expect(dayItemSignature(a)).not.toBe(dayItemSignature(b));
    expect(dayItemSignature(sigItem({ customLabel: 'Pyro' }))).toBe(dayItemSignature(sigItem()));
    expect(dayItemSignature(sigItem({ type: 'custom', customLabel: ' Pyro   FX ' }))).toBe(
      dayItemSignature(sigItem({ type: 'custom', customLabel: 'pyro fx' })),
    );
  });

  it('is not fooled by delimiter-looking characters inside free-text fields', () => {
    const a = sigItem({ type: 'custom', customLabel: 'foo|08:00', startTime: '09:00', item: 'bar' });
    const b = sigItem({ type: 'custom', customLabel: 'foo', startTime: '08:00', endTime: '09:00', item: '|bar' });
    expect(dayItemSignature(a)).not.toBe(dayItemSignature(b));
  });

  it('claims each existing row at most once (two identical incoming → one match, one fresh)', () => {
    const existing = [sigItem({ id: 'a' })];
    const incoming = [sigItem({ id: 'b' }), sigItem({ id: 'c' })];
    const { fresh, matched } = matchItemsBySignature(existing, incoming);
    expect(matched.map((m) => [m.existing.id, m.incoming.id])).toEqual([['a', 'b']]);
    expect(fresh.map((i) => i.id)).toEqual(['c']);
  });
});
