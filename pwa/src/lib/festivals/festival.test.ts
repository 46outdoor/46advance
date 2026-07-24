import { describe, it, expect } from 'vitest';
import {
  festivalInputSchema,
  parseFestival,
  resolveShowLogo,
  sortFestivals,
  type FestivalRecord,
} from './festival';
import type { Logo } from '@/lib/branding/logo';

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

describe('resolveShowLogo', () => {
  const festLogo: Logo = { onDark: null, onLight: null, name: 'festival' };
  const override: Logo = { onDark: null, onLight: null, name: 'override' };
  const festivals: FestivalRecord[] = [{ id: 'f1', name: 'RTC', logo: festLogo, order: 0 }];

  it('prefers the per-event override', () => {
    expect(resolveShowLogo(override, 'f1', festivals)).toBe(override);
  });

  it('falls back to the festival logo', () => {
    expect(resolveShowLogo(null, 'f1', festivals)).toBe(festLogo);
  });

  it('is null with no override and no matching festival', () => {
    expect(resolveShowLogo(null, null, festivals)).toBeNull();
    expect(resolveShowLogo(null, 'unknown', festivals)).toBeNull();
  });
});

describe('festivalInputSchema', () => {
  it('trims and requires a name', () => {
    expect(festivalInputSchema.parse({ name: '  RTC ' }).name).toBe('RTC');
    expect(() => festivalInputSchema.parse({ name: '   ' })).toThrow();
  });
});
