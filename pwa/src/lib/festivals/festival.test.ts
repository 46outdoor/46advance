import { describe, it, expect } from 'vitest';
import { festivalInputSchema, parseFestival, sortFestivals, type FestivalRecord } from './festival';

describe('parseFestival', () => {
  it('parses a name and defaults order + logo', () => {
    expect(parseFestival('f1', { name: 'Rock the Country' })).toEqual({
      id: 'f1',
      name: 'Rock the Country',
      logo: null,
      order: 0,
    });
  });

  it('parses order and a logo when present', () => {
    const f = parseFestival('f2', {
      name: 'RTC',
      order: 2,
      logo: { onDark: null, onLight: null, name: 'mark' },
    });
    expect(f.order).toBe(2);
    expect(f.logo).toEqual({ onDark: null, onLight: null, name: 'mark' });
  });

  it('rejects an empty name', () => {
    expect(() => parseFestival('x', { name: '' })).toThrow();
  });
});

describe('sortFestivals', () => {
  it('orders by order, then name', () => {
    const festivals: FestivalRecord[] = [
      { id: 'b', name: 'Beta', logo: null, order: 1 },
      { id: 'a', name: 'Alpha', logo: null, order: 1 },
      { id: 'z', name: 'Zed', logo: null, order: 0 },
    ];
    expect(sortFestivals(festivals).map((f) => f.id)).toEqual(['z', 'a', 'b']);
  });
});

describe('festivalInputSchema', () => {
  it('trims and requires a name', () => {
    expect(festivalInputSchema.parse({ name: '  RTC ' }).name).toBe('RTC');
    expect(() => festivalInputSchema.parse({ name: '   ' })).toThrow();
  });
});
