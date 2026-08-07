import { describe, expect, it } from 'vitest';
import type { SlotResolver } from '../schedules/placeholders';
import {
  digestDescription,
  digestItemsFromDay,
  digestSummary,
  digestVEventLines,
  feedCalendarLines,
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
