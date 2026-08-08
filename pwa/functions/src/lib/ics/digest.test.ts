import { describe, expect, it } from 'vitest';
import type { SlotResolver } from '../schedules/placeholders';
import {
  digestDescription,
  digestItemsFromDay,
  digestSummary,
  digestVEventLines,
  feedCalendarLines,
  itemVEventLines,
  type DigestItem,
} from './digest';

const item = (over: Partial<DigestItem>): DigestItem => ({
  startTime: null,
  endTime: null,
  nextDay: false,
  name: 'Item',
  stageName: null,
  ...over,
});

describe('digestItemsFromDay', () => {
  const resolve: SlotResolver = (stageIndex, slot) =>
    stageIndex === 0 && slot === 1 ? 'Ashley McBryde' : null;
  const stageNames = new Map([['stage-1', 'Main Stage']]);

  it('excludes pushToCalendar:false, resolves placeholders, and maps stage names', () => {
    const rows = digestItemsFromDay(
      [
        {
          id: 'i1',
          item: '{artist_1} — Truck Dump',
          startTime: '09:00',
          endTime: '10:00',
          stageId: 'stage-1',
        },
        { id: 'i2', item: 'Hidden', startTime: '11:00', pushToCalendar: false },
      ],
      resolve,
      stageNames,
    );
    expect(rows).toEqual([
      {
        startTime: '09:00',
        endTime: '10:00',
        nextDay: false,
        name: 'Ashley McBryde — Truck Dump',
        stageName: 'Main Stage',
      },
    ]);
  });

  it('treats malformed or missing times as untimed and unknown stages as stageless', () => {
    const rows = digestItemsFromDay(
      [{ id: 'i1', item: 'Lunch', startTime: '9am', endTime: 42, stageId: 'gone' }],
      resolve,
      stageNames,
    );
    expect(rows).toEqual([
      { startTime: null, endTime: null, nextDay: false, name: 'Lunch', stageName: null },
    ]);
  });
});

describe('digestSummary', () => {
  it('prefers the day title, else the day-type label, else the raw key', () => {
    expect(digestSummary({ eventLabel: 'BOTB', dayTitle: 'Show Day', dayType: 'show' })).toBe(
      'BOTB — Show Day',
    );
    expect(digestSummary({ eventLabel: 'BOTB', dayTitle: null, dayType: 'loadIn' })).toBe(
      'BOTB — Load In',
    );
    expect(digestSummary({ eventLabel: 'Event', dayTitle: null, dayType: 'mystery' })).toBe(
      'Event — mystery',
    );
  });
});

describe('digestDescription', () => {
  it('orders same-day rows by time, then "+1" rows marked, then an Untimed section', () => {
    const body = digestDescription([
      item({ startTime: '01:00', endTime: '02:00', nextDay: true, name: 'Bus Call' }),
      item({ name: 'Lunch' }),
      item({ startTime: '09:00', endTime: '10:00', name: 'Truck Dump', stageName: 'Main Stage' }),
      item({ startTime: '08:00', endTime: '09:00', name: 'Crew Call', stageName: 'Main Stage' }),
    ]);
    expect(body).toBe(
      [
        '8:00–9:00 AM · Crew Call · Main Stage',
        '9:00–10:00 AM · Truck Dump · Main Stage',
        '1:00–2:00 AM (+1) · Bus Call',
        'Untimed',
        'Lunch',
      ].join('\n'),
    );
  });

  it('renders start-only rows and returns an empty string for an empty day', () => {
    expect(digestDescription([item({ startTime: '08:00', name: 'Doors' })])).toBe('8:00 AM · Doors');
    expect(digestDescription([])).toBe('');
  });
});

describe('digestVEventLines', () => {
  const input = {
    eventId: 'evt1',
    dayKey: '2026-08-31',
    eventLabel: 'BOTB',
    dayTitle: null,
    dayType: 'show',
    updatedAt: new Date('2026-08-06T18:00:00Z'),
    items: [item({ startTime: '08:00', endTime: '09:00', name: 'Crew Call' })],
  };

  it('emits the full digest VEVENT with stable UID and deterministic stamps', () => {
    expect(digestVEventLines(input)).toEqual([
      'BEGIN:VEVENT',
      'UID:day-evt1-2026-08-31@46advance.com',
      'DTSTAMP:20260806T180000Z',
      'LAST-MODIFIED:20260806T180000Z',
      'DTSTART;VALUE=DATE:20260831',
      'DTEND;VALUE=DATE:20260901',
      'TRANSP:TRANSPARENT',
      'SUMMARY:BOTB — Show',
      'DESCRIPTION:8:00–9:00 AM · Crew Call',
      'END:VEVENT',
    ]);
  });

  it('escapes SUMMARY/DESCRIPTION text and omits an empty DESCRIPTION', () => {
    const lines = digestVEventLines({
      ...input,
      dayTitle: 'Load In, Day 1; Prep',
      items: [],
    });
    expect(lines).toContain('SUMMARY:BOTB — Load In\\, Day 1\\; Prep');
    expect(lines.some((l) => l.startsWith('DESCRIPTION'))).toBe(false);
  });
});

describe('itemVEventLines', () => {
  const base = {
    eventId: 'evt1',
    dayKey: '2026-08-31',
    timeZone: 'America/Chicago',
    updatedAt: new Date('2026-08-06T18:00:00Z'),
    resolve: ((stageIndex, slot) =>
      stageIndex === 0 && slot === 1 ? 'Ashley McBryde' : null) as SlotResolver,
  };

  it('emits one opaque timed VEVENT per pushable item with a globally unique UID', () => {
    const [vevent] = itemVEventLines({
      ...base,
      items: [{ id: 'i1', item: '{artist_1} — Set', startTime: '21:00', endTime: '22:30' }],
    });
    expect(vevent).toEqual([
      'BEGIN:VEVENT',
      'UID:sched-evt1-i1@46advance.com',
      'DTSTAMP:20260806T180000Z',
      'LAST-MODIFIED:20260806T180000Z',
      // 21:00 America/Chicago (CDT, UTC-5) on 2026-08-31 → 02:00Z the next day.
      'DTSTART:20260901T020000Z',
      'DTEND:20260901T033000Z',
      'SUMMARY:Ashley McBryde — Set',
      'END:VEVENT',
    ]);
    // No TRANSP line: item-mode events stay opaque (busy), unlike the digest.
    expect(vevent.some((l) => l.startsWith('TRANSP'))).toBe(false);
  });

  it('sanitizes a crafted item id so it cannot break out of the UID line', () => {
    // Item ids live in the scheduleDays items ARRAY, which rules cannot validate — an
    // event editor could store CR/LF and inject into every other member's feed.
    const [vevent] = itemVEventLines({
      ...base,
      items: [
        { id: 'i1\r\nBEGIN:VEVENT\r\nSUMMARY:Injected', item: 'Doors', startTime: '18:00' },
      ],
    });
    const uidLines = vevent.filter((l) => l.startsWith('UID:'));
    expect(uidLines).toHaveLength(1);
    expect(uidLines[0]).toBe('UID:sched-evt1-i1BEGIN:VEVENTSUMMARY:Injected@46advance.com');
    expect(vevent.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(vevent.join('\r\n')).not.toContain('\r\nSUMMARY:Injected');
  });

  it('omits untimed items, pushToCalendar:false items, and rows without an id', () => {
    const vevents = itemVEventLines({
      ...base,
      items: [
        { id: 'i1', item: 'Lunch', startTime: null },
        { id: 'i2', item: 'Secret', startTime: '10:00', pushToCalendar: false },
        { item: 'No id', startTime: '11:00' },
        { id: 'i4', item: 'Doors', startTime: '18:00' },
      ],
    });
    expect(vevents).toHaveLength(1);
    expect(vevents[0]).toContain('UID:sched-evt1-i4@46advance.com');
  });

  it('carries location and description, and defaults a missing end to +30m', () => {
    const [vevent] = itemVEventLines({
      ...base,
      items: [
        {
          id: 'i1',
          item: 'Crew Call',
          startTime: '08:00',
          description: 'Bring {artist_1} passes',
          fields: { location: 'Dock B', note: 'north gate' },
          crew: [{ type: 'Stagehands', quantity: 12, hours: 8 }],
        },
      ],
    });
    expect(vevent).toContain('DTSTART:20260831T130000Z');
    expect(vevent).toContain('DTEND:20260831T133000Z');
    expect(vevent).toContain('LOCATION:Dock B');
    expect(vevent).toContain(
      'DESCRIPTION:Bring Ashley McBryde passes\\nnote: north gate\\n(12) Stagehands · 8h',
    );
  });

  it('shifts "+1" rows to the next date and rolls an overnight end forward', () => {
    const [vevent] = itemVEventLines({
      ...base,
      items: [{ id: 'i1', item: 'Load Out', startTime: '23:00', endTime: '02:00' }],
    });
    expect(vevent).toContain('DTSTART:20260901T040000Z');
    expect(vevent).toContain('DTEND:20260901T070000Z');
    const [nextDay] = itemVEventLines({
      ...base,
      items: [{ id: 'i2', item: 'Bus Call', startTime: '01:00', nextDay: true }],
    });
    expect(nextDay).toContain('DTSTART:20260901T060000Z');
  });
});

describe('feedCalendarLines', () => {
  it('wraps flattened VEVENTs in the calendar envelope with the refresh hints', () => {
    const lines = feedCalendarLines([
      ['BEGIN:VEVENT', 'UID:a@46advance.com', 'END:VEVENT'],
      ['BEGIN:VEVENT', 'UID:b@46advance.com', 'END:VEVENT'],
    ]);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
    expect(lines).toContain('PRODID:-//46 Entertainment//46 Advance Calendar Feed//EN');
    expect(lines).toContain('NAME:46 Advance');
    expect(lines).toContain('X-WR-CALNAME:46 Advance');
    expect(lines).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT15M');
    expect(lines).toContain('X-PUBLISHED-TTL:PT15M');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines.indexOf('UID:a@46advance.com')).toBeLessThan(lines.indexOf('UID:b@46advance.com'));
  });
});
