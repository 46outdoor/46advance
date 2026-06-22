import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { parseAdvance, advanceInputSchema } from './advance';
import { SECTION_KEYS } from './sections';

describe('parseAdvance', () => {
  it('fills missing sections with not_started and normalizes timestamps', () => {
    const a = parseAdvance('adv-1', {
      artistName: 'The Band',
      createdBy: 'pm-1',
      sections: {
        transportation: {
          status: 'complete',
          finalizedAt: Timestamp.fromDate(new Date('2026-06-21T00:00:00Z')),
          finalizedBy: 'pm-1',
        },
      },
    });
    expect(a.id).toBe('adv-1');
    expect(a.artistName).toBe('The Band');
    // every standard slot present
    expect(Object.keys(a.sections).sort()).toEqual([...SECTION_KEYS].sort());
    expect(a.sections.transportation.status).toBe('complete');
    expect(a.sections.transportation.finalizedAt?.toISOString()).toBe('2026-06-21T00:00:00.000Z');
    expect(a.sections['show-schedule']).toEqual({
      status: 'not_started',
      finalizedAt: null,
      finalizedBy: null,
    });
  });

  it('throws on a malformed doc', () => {
    expect(() => parseAdvance('x', { createdBy: 'p' })).toThrow(); // missing artistName
    expect(() => parseAdvance('x', { artistName: 'A', createdBy: 'p', sections: { transportation: { status: 'bogus' } } })).toThrow();
  });
});

describe('advanceInputSchema', () => {
  it('requires a non-empty artist name', () => {
    expect(advanceInputSchema.parse({ artistName: 'A' }).artistName).toBe('A');
    expect(() => advanceInputSchema.parse({ artistName: '   ' })).toThrow();
  });
});
