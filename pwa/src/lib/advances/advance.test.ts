import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { advanceInputSchema, parseAdvance, slotLabel } from './advance';

describe('parseAdvance', () => {
  it('parses department-keyed sections, structured fields, and timestamps', () => {
    const a = parseAdvance('adv-1', {
      artistName: 'The Band',
      createdBy: 'pm-1',
      concerns: 'needs 1/4"',
      sections: {
        audio: {
          status: 'complete',
          finalizedAt: Timestamp.fromDate(new Date('2026-06-23T00:00:00Z')),
          finalizedBy: 'pm-1',
        },
        lighting: { status: 'in_progress', finalizedAt: null, finalizedBy: null },
      },
    });
    expect(a.artistName).toBe('The Band');
    expect(a.concerns).toBe('needs 1/4"');
    expect(Object.keys(a.sections).sort()).toEqual(['audio', 'lighting']);
    expect(a.sections.audio.status).toBe('complete');
    expect(a.sections.audio.finalizedAt?.toISOString()).toBe('2026-06-23T00:00:00.000Z');
    expect(a.sections.lighting.status).toBe('in_progress');
  });

  it('defaults sections to {} when absent', () => {
    expect(parseAdvance('x', { artistName: 'A', createdBy: 'p' }).sections).toEqual({});
  });

  it('reads the lineup slot, defaulting to null', () => {
    expect(parseAdvance('x', { artistName: 'A', createdBy: 'p' }).slot).toBeNull();
    expect(parseAdvance('x', { artistName: 'A', createdBy: 'p', slot: 2 }).slot).toBe(2);
  });

  it('throws on a malformed doc', () => {
    expect(() => parseAdvance('x', { createdBy: 'p' })).toThrow(); // missing artistName
    expect(() =>
      parseAdvance('x', { artistName: 'A', createdBy: 'p', sections: { audio: { status: 'bogus' } } }),
    ).toThrow();
  });
});

describe('advanceInputSchema', () => {
  it('requires a non-empty artist name', () => {
    expect(advanceInputSchema.parse({ artistName: 'A' }).artistName).toBe('A');
    expect(() => advanceInputSchema.parse({ artistName: '   ' })).toThrow();
  });

  it('accepts an optional lineup slot', () => {
    expect(advanceInputSchema.parse({ artistName: 'A', slot: 3 }).slot).toBe(3);
    expect(advanceInputSchema.parse({ artistName: 'A', slot: null }).slot).toBeNull();
  });
});

describe('slotLabel', () => {
  it('maps lineup positions to labels', () => {
    expect(slotLabel(1)).toBe('Headliner');
    expect(slotLabel(2)).toBe('Direct Support');
    expect(slotLabel(3)).toBe('Artist 3');
    expect(slotLabel(5)).toBe('Artist 5');
  });
});
