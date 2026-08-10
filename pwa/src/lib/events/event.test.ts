import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  compareEventsByDate,
  composeEventName,
  eventDays,
  eventInputSchema,
  parseEvent,
  type EventRecord,
} from './event';
import { dayKeyToInstant, zonedDayKey } from '@/lib/dates/timezone';

describe('parseEvent', () => {
  // Venue NAME and street address are stored separately so the packet cover can print each on its
  // own line. Events created before the split have them combined in `venue` and no `venueAddress`;
  // the packet falls back to splitting on a colon for those, so null here must survive as null.
  it('reads venueAddress, defaulting to null on events predating the field', () => {
    const withAddress = parseEvent('evt-a', {
      name: 'Rock the Country 2026',
      status: 'active',
      createdBy: 'admin-1',
      venue: 'Boyd County Fairgrounds',
      venueAddress: '1760 Addington Road. Ashland, KY 41102',
    });
    expect(withAddress.venue).toBe('Boyd County Fairgrounds');
    expect(withAddress.venueAddress).toBe('1760 Addington Road. Ashland, KY 41102');

    const legacy = parseEvent('evt-b', {
      name: 'Older Event',
      status: 'active',
      createdBy: 'admin-1',
      venue: 'Boyd County Fairgrounds: 1760 Addington Road',
    });
    expect(legacy.venueAddress).toBeNull();
    expect(legacy.venue).toBe('Boyd County Fairgrounds: 1760 Addington Road');
  });

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
    expect(e.timeZone).toBe('America/Chicago'); // default
    expect(e.shortCode).toBeNull(); // defaults to null when absent
  });

  it('parses a short code when present', () => {
    const e = parseEvent('evt-2', {
      name: 'Battle of the Bands',
      status: 'active',
      createdBy: 'admin-1',
      shortCode: 'BOTB',
    });
    expect(e.shortCode).toBe('BOTB');
  });

  it('rejects an unknown status', () => {
    expect(() => parseEvent('x', { name: 'X', status: 'live', createdBy: 'a' })).toThrow();
  });

  it('defaults packetDrive to null, and parses it when present', () => {
    expect(parseEvent('x', { name: 'X', status: 'active', createdBy: 'a' }).packetDrive).toBeNull();
    const saved = Timestamp.fromDate(new Date('2026-07-24T20:40:00Z'));
    const e = parseEvent('evt-3', {
      name: 'RTC',
      status: 'active',
      createdBy: 'admin-1',
      packetDrive: { fileId: 'file-1', webViewLink: 'https://drive/x', savedAt: saved },
    });
    expect(e.packetDrive).toEqual({
      fileId: 'file-1',
      webViewLink: 'https://drive/x',
      savedAt: saved.toDate(),
      version: 1, // defaults to 1 when the stored doc predates versioning
    });
  });

  it('preserves an explicit packet version', () => {
    const e = parseEvent('evt-4', {
      name: 'RTC',
      status: 'active',
      createdBy: 'admin-1',
      packetDrive: { fileId: 'f', webViewLink: 'https://drive/y', savedAt: null, version: 3 },
    });
    expect(e.packetDrive?.version).toBe(3);
  });

  it('uses an explicit timezone when set', () => {
    const e = parseEvent('x', { name: 'X', status: 'active', createdBy: 'a', timeZone: 'America/Los_Angeles' });
    expect(e.timeZone).toBe('America/Los_Angeles');
  });
});

describe('composeEventName', () => {
  const tz = 'America/Chicago';
  const start = new Date('2026-07-10T12:00:00Z');

  it('composes "{festival} {year} — {location}"', () => {
    expect(composeEventName('Rock the Country', start, 'Ashland', tz)).toBe(
      'Rock the Country 2026 — Ashland',
    );
  });

  it('drops the location when empty', () => {
    expect(composeEventName('RTC', start, '  ', tz)).toBe('RTC 2026');
  });

  it('drops the year when there is no start date', () => {
    expect(composeEventName('RTC', null, 'Ashland', tz)).toBe('RTC — Ashland');
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
  // A non-Central event zone proves the days derive from the EVENT zone, not the test runner's.
  const TZ = 'America/Los_Angeles';

  it('lists each calendar day from start to end inclusive, in the event zone', () => {
    const days = eventDays(dayKeyToInstant('2026-06-26', TZ), dayKeyToInstant('2026-06-28', TZ), TZ); // Fri–Sun
    expect(days.map((d) => zonedDayKey(d, TZ))).toEqual(['2026-06-26', '2026-06-27', '2026-06-28']);
  });

  it('returns a single day when end is null', () => {
    expect(eventDays(dayKeyToInstant('2026-06-26', TZ), null, TZ)).toHaveLength(1);
  });

  it('returns [] when there is no start', () => {
    expect(eventDays(null, null, TZ)).toEqual([]);
  });
});


describe('compareEventsByDate', () => {
  const ev = (name: string, iso: string | null): EventRecord =>
    ({ id: name, name, startDate: iso ? new Date(iso) : null }) as EventRecord;

  const order = (events: EventRecord[]) => [...events].sort(compareEventsByDate).map((e) => e.name);

  it('orders soonest first', () => {
    expect(order([ev('later', '2026-09-01'), ev('sooner', '2026-06-01')])).toEqual([
      'sooner',
      'later',
    ]);
  });

  it('sinks undated events below every dated one', () => {
    // Whichever side the undated event starts on — a comparator that only handles one
    // direction produces an order that depends on the input, which is the classic bug here.
    expect(order([ev('undated', null), ev('dated', '2026-09-01')])).toEqual(['dated', 'undated']);
    expect(order([ev('dated', '2026-09-01'), ev('undated', null)])).toEqual(['dated', 'undated']);
  });

  it('falls back to name on identical dates, and between two undated events', () => {
    expect(order([ev('Beta', '2026-06-01'), ev('Alpha', '2026-06-01')])).toEqual(['Alpha', 'Beta']);
    expect(order([ev('Beta', null), ev('Alpha', null)])).toEqual(['Alpha', 'Beta']);
  });

  it('is a total order — sorting is stable whatever the input order', () => {
    const events = [
      ev('c-undated', null),
      ev('b-june', '2026-06-01'),
      ev('a-undated', null),
      ev('d-may', '2026-05-01'),
    ];
    const expected = ['d-may', 'b-june', 'a-undated', 'c-undated'];
    expect(order(events)).toEqual(expected);
    expect(order([...events].reverse())).toEqual(expected);
  });

  it('does NOT order by name when dates disagree — the alphabetical regression', () => {
    // The exact shape of the bug: names embed the city, so alphabetical ordered a tour by city.
    const tour = [ev('Zulu City', '2026-06-01'), ev('Ashland', '2026-08-01')];
    expect(order(tour)).toEqual(['Zulu City', 'Ashland']);
  });
});
