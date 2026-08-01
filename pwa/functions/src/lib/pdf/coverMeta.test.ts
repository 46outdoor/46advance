import { describe, it, expect } from 'vitest';
import { coverMetaLines } from './packet.js';

/**
 * The packet cover lists venue name, venue address and dates on separate lines. Events now store
 * the address in its own `venueAddress` field, which prints verbatim. Legacy events (no
 * `venueAddress`) keep both in `venue`, separable only by convention (the first colon) — the
 * cases below pin that fallback's degradation, since guessing wrong would mangle a real venue name.
 */
describe('coverMetaLines — legacy combined venue (no venueAddress)', () => {
  const dateRange = 'Jul 10, 2026 – Jul 11, 2026';

  it('splits "Name: Address" into two lines, then dates', () => {
    expect(
      coverMetaLines({
        event: { venue: 'Boyd County Fairgrounds: 1760 Addington Road. Ashland, KY 41102', dateRange },
      }),
    ).toEqual(['Boyd County Fairgrounds', '1760 Addington Road. Ashland, KY 41102', dateRange]);
  });

  it('keeps a venue with no colon on a single line', () => {
    expect(coverMetaLines({ event: { venue: 'Boyd County Fairgrounds', dateRange } })).toEqual([
      'Boyd County Fairgrounds',
      dateRange,
    ]);
  });

  // Splitting on a colon that leaves either side empty would produce a blank line.
  it.each([
    ['leading colon', ': 1760 Addington Road'],
    ['trailing colon', 'Boyd County Fairgrounds:'],
  ])('does not split on a %s', (_label, venue) => {
    expect(coverMetaLines({ event: { venue, dateRange } })).toEqual([venue, dateRange]);
  });

  it('splits only on the FIRST colon, so an address containing one survives', () => {
    expect(
      coverMetaLines({ event: { venue: 'The Venue: Gate 3: 12 Main St', dateRange: null } }),
    ).toEqual(['The Venue', 'Gate 3: 12 Main St']);
  });

  it('omits missing parts rather than emitting blank lines', () => {
    expect(coverMetaLines({ event: { venue: null, dateRange } })).toEqual([dateRange]);
    expect(coverMetaLines({ event: { venue: 'Somewhere', dateRange: null } })).toEqual(['Somewhere']);
    expect(coverMetaLines({ event: { venue: '   ', dateRange: '  ' } })).toEqual([]);
  });

  // A blank/whitespace address must not count as "explicit" — otherwise clearing the new field
  // would silently drop a legacy event's address line instead of falling back to the split.
  it('falls back to the split when venueAddress is blank or whitespace', () => {
    expect(
      coverMetaLines({ event: { venue: 'Boyd County Fairgrounds: 1760 Addington Road', venueAddress: '  ', dateRange } }),
    ).toEqual(['Boyd County Fairgrounds', '1760 Addington Road', dateRange]);
    expect(
      coverMetaLines({ event: { venue: 'Boyd County Fairgrounds: 1760 Addington Road', venueAddress: null, dateRange } }),
    ).toEqual(['Boyd County Fairgrounds', '1760 Addington Road', dateRange]);
  });
});

/** With the address stored separately, both fields print exactly as entered — no colon guessing. */
describe('coverMetaLines — explicit venueAddress', () => {
  const dateRange = 'Jul 10, 2026 – Jul 11, 2026';

  it('emits venue, address, dates with no splitting', () => {
    expect(
      coverMetaLines({
        event: {
          venue: 'Boyd County Fairgrounds',
          venueAddress: '1760 Addington Road. Ashland, KY 41102',
          dateRange,
        },
      }),
    ).toEqual(['Boyd County Fairgrounds', '1760 Addington Road. Ashland, KY 41102', dateRange]);
  });

  it('wins over a colon in the venue — the name prints verbatim', () => {
    expect(
      coverMetaLines({
        event: { venue: 'The Venue: Gate 3', venueAddress: '12 Main St', dateRange },
      }),
    ).toEqual(['The Venue: Gate 3', '12 Main St', dateRange]);
  });

  it('omits dates when there are none', () => {
    expect(
      coverMetaLines({
        event: { venue: 'Boyd County Fairgrounds', venueAddress: '1760 Addington Road', dateRange: null },
      }),
    ).toEqual(['Boyd County Fairgrounds', '1760 Addington Road']);
  });

  it('emits the address alone when the venue is missing or whitespace', () => {
    expect(coverMetaLines({ event: { venue: null, venueAddress: '1760 Addington Road', dateRange } })).toEqual([
      '1760 Addington Road',
      dateRange,
    ]);
    expect(
      coverMetaLines({ event: { venue: '   ', venueAddress: '1760 Addington Road', dateRange: null } }),
    ).toEqual(['1760 Addington Road']);
  });

  it('trims both fields', () => {
    expect(
      coverMetaLines({
        event: { venue: '  Boyd County Fairgrounds  ', venueAddress: '  1760 Addington Road  ', dateRange: null },
      }),
    ).toEqual(['Boyd County Fairgrounds', '1760 Addington Road']);
  });
});
