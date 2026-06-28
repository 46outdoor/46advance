import { describe, it, expect } from 'vitest';
import {
  effectiveLogos,
  emptyLogo,
  hasLogo,
  logoForBackground,
  parseLogo,
  type Logo,
} from './logo';

const img = (path: string) => ({ path, url: `https://example.test/${path}` });

describe('branding/logo', () => {
  it('emptyLogo has no usable variant', () => {
    expect(hasLogo(emptyLogo())).toBe(false);
  });

  it('hasLogo is true when either variant is present, false for null', () => {
    expect(hasLogo({ onDark: img('d'), onLight: null, name: null })).toBe(true);
    expect(hasLogo({ onDark: null, onLight: img('l'), name: null })).toBe(true);
    expect(hasLogo(null)).toBe(false);
  });

  it('logoForBackground picks the matching variant, falling back to the other', () => {
    const both: Logo = { onDark: img('d'), onLight: img('l'), name: null };
    expect(logoForBackground(both, 'dark')?.path).toBe('d');
    expect(logoForBackground(both, 'light')?.path).toBe('l');
    // Fallback when the preferred variant is missing.
    expect(logoForBackground({ onDark: img('d'), onLight: null, name: null }, 'light')?.path).toBe('d');
    expect(logoForBackground({ onDark: null, onLight: img('l'), name: null }, 'dark')?.path).toBe('l');
  });

  it('effectiveLogos: event logo first, then defaults, dropping empties, capped at 3', () => {
    const ev: Logo = { onDark: img('e'), onLight: null, name: 'Event' };
    const d1: Logo = { onDark: img('46'), onLight: img('46l'), name: '46' };
    const d2: Logo = { onDark: img('pt'), onLight: null, name: 'Peachtree' };
    const d3: Logo = { onDark: img('x'), onLight: null, name: 'Extra' };
    const row = effectiveLogos(ev, [d1, emptyLogo(), d2, d3]);
    expect(row.map((l) => l.name)).toEqual(['Event', '46', 'Peachtree']);
  });

  it('effectiveLogos with no event logo uses defaults only', () => {
    const d1: Logo = { onDark: img('46'), onLight: null, name: '46' };
    expect(effectiveLogos(null, [d1]).map((l) => l.name)).toEqual(['46']);
  });

  it('parseLogo normalizes missing variants/name to null', () => {
    expect(parseLogo({ onDark: img('d') })).toEqual({ onDark: img('d'), onLight: null, name: null });
    expect(parseLogo({})).toEqual({ onDark: null, onLight: null, name: null });
  });
});
