import { describe, it, expect } from 'vitest';
import { coverMetaLines } from './packet.js';

/**
 * The packet cover lists venue name, venue address and dates on separate lines. `venue` is one
 * stored field, so the split is by convention (the first colon) — these pin the degradation when
 * that convention isn't followed, since guessing wrong would mangle a real venue name.
 */
describe('coverMetaLines', () => {
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
});
