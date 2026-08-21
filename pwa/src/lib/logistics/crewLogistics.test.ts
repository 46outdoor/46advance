import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  compareCrewLogistics,
  crewLogisticsInputSchema,
  isValidTimeZone,
  parseCrewLogistics,
  type CrewLogisticsRecord,
} from './crewLogistics';

const baseDoc = {
  eventContactId: 'attach-1',
  contactId: 'contact-1',
  userId: 'uid-1',
  notes: null,
  createdBy: 'pm-1',
  createdAt: Timestamp.fromDate(new Date('2026-08-01T12:00:00Z')),
  updatedAt: null,
};

const lodgingDoc = {
  ...baseDoc,
  kind: 'lodging',
  hotelName: 'Hampton Inn Ashland',
  address: '1 Main St',
  hotelPhone: null,
  confirmation: 'ABC123',
  checkInDate: '2026-07-09',
  checkOutDate: '2026-07-12',
  roomType: 'Double queen',
  roomNumber: '412',
};

const travelDoc = {
  ...baseDoc,
  kind: 'travel',
  mode: 'flight',
  carrier: 'AA',
  confirmation: 'XYZ789',
  from: 'DFW',
  to: 'CVG',
  departAt: Timestamp.fromDate(new Date('2026-07-09T14:00:00Z')),
  arriveAt: Timestamp.fromDate(new Date('2026-07-09T16:15:00Z')),
  departTimeZone: 'America/Chicago',
  arriveTimeZone: 'America/New_York',
};

describe('parseCrewLogistics', () => {
  it('parses a lodging record with date-only day keys', () => {
    const r = parseCrewLogistics('r1', lodgingDoc);
    expect(r.kind).toBe('lodging');
    if (r.kind !== 'lodging') return;
    expect(r.checkInDate).toBe('2026-07-09');
    expect(r.roomNumber).toBe('412');
    expect(r.userId).toBe('uid-1');
  });

  it('parses a travel record: instants → Dates, zones preserved', () => {
    const r = parseCrewLogistics('r2', travelDoc);
    expect(r.kind).toBe('travel');
    if (r.kind !== 'travel') return;
    expect(r.departAt?.toISOString()).toBe('2026-07-09T14:00:00.000Z');
    expect(r.arriveTimeZone).toBe('America/New_York');
  });

  it('rejects unknown keys — the shape is closed', () => {
    expect(() => parseCrewLogistics('r3', { ...lodgingDoc, roomRate: 129 })).toThrow();
  });

  it('rejects check-out before check-in', () => {
    expect(() =>
      parseCrewLogistics('r4', { ...lodgingDoc, checkInDate: '2026-07-12', checkOutDate: '2026-07-09' }),
    ).toThrow();
  });

  it('rejects a calendar-invalid day key', () => {
    expect(() => parseCrewLogistics('r5', { ...lodgingDoc, checkInDate: '2026-02-30' })).toThrow();
  });

  it('rejects an instant without its zone', () => {
    expect(() => parseCrewLogistics('r6', { ...travelDoc, departTimeZone: null })).toThrow();
  });

  it('rejects arrival before departure', () => {
    expect(() =>
      parseCrewLogistics('r7', {
        ...travelDoc,
        arriveAt: Timestamp.fromDate(new Date('2026-07-09T10:00:00Z')),
      }),
    ).toThrow();
  });

  it('rejects a bogus IANA zone', () => {
    expect(() =>
      parseCrewLogistics('r8', { ...travelDoc, departTimeZone: 'America/Not_A_Place' }),
    ).toThrow();
  });
});

describe('crewLogisticsInputSchema', () => {
  it('accepts a minimal lodging input', () => {
    const parsed = crewLogisticsInputSchema.safeParse({
      kind: 'lodging',
      hotelName: 'Hampton Inn',
      checkInDate: '2026-07-09',
      checkOutDate: '2026-07-09', // same-day checkout allowed (>=)
    });
    expect(parsed.success).toBe(true);
  });

  it('requires the zone when a travel instant is present', () => {
    const parsed = crewLogisticsInputSchema.safeParse({
      kind: 'travel',
      mode: 'flight',
      departAt: new Date('2026-07-09T14:00:00Z'),
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a blank hotel name', () => {
    const parsed = crewLogisticsInputSchema.safeParse({
      kind: 'lodging',
      hotelName: '   ',
      checkInDate: '2026-07-09',
      checkOutDate: '2026-07-10',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('isValidTimeZone', () => {
  it('accepts real zones, rejects garbage', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(isValidTimeZone('America/Not_A_Place')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('compareCrewLogistics', () => {
  const rec = (id: string, over: Partial<Record<string, unknown>>): CrewLogisticsRecord =>
    parseCrewLogistics(id, { ...lodgingDoc, ...over });
  const travelRec = (id: string, over: Partial<Record<string, unknown>>): CrewLogisticsRecord =>
    parseCrewLogistics(id, { ...travelDoc, ...over });

  it('orders by anchor date across kinds, and sorts the same set from both directions', () => {
    const a = rec('a', { checkInDate: '2026-07-08', checkOutDate: '2026-07-09' });
    const b = travelRec('b', {}); // departs 07-09
    const c = rec('c', { checkInDate: '2026-07-10', checkOutDate: '2026-07-11' });
    const undated = travelRec('d', {
      departAt: null,
      arriveAt: null,
      departTimeZone: null,
      arriveTimeZone: null,
    });
    const expected = ['a', 'b', 'c', 'd'];
    expect([a, b, c, undated].sort(compareCrewLogistics).map((r) => r.id)).toEqual(expected);
    // Reversed input — catches a comparator that only handles one direction of the
    // undated case (house style, from the events-list ordering fix).
    expect([undated, c, b, a].sort(compareCrewLogistics).map((r) => r.id)).toEqual(expected);
  });
});
