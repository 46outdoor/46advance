import { describe, it, expect } from 'vitest';
import {
  emptyLogo,
  hasLogo,
  logoForBackground,
  logoPaths,
  parseLogo,
  supersededLogoPaths,
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

  it('parseLogo normalizes missing variants/name to null', () => {
    expect(parseLogo({ onDark: img('d') })).toEqual({ onDark: img('d'), onLight: null, name: null });
    expect(parseLogo({})).toEqual({ onDark: null, onLight: null, name: null });
  });

  it('logoPaths lists the referenced variant paths', () => {
    expect(logoPaths({ onDark: img('d'), onLight: img('l'), name: null }).sort()).toEqual(['d', 'l']);
    expect(logoPaths(emptyLogo())).toEqual([]);
  });

  it('supersededLogoPaths returns paths dropped between prev and next (F-5)', () => {
    const prev: Logo = { onDark: img('old-d'), onLight: img('keep'), name: null };
    // onDark replaced (old-d → new-d), onLight unchanged (keep) → only old-d is superseded.
    const next: Logo = { onDark: img('new-d'), onLight: img('keep'), name: null };
    expect(supersededLogoPaths(prev, next)).toEqual(['old-d']);
    // Removing a variant supersedes its path; adding one supersedes nothing.
    expect(supersededLogoPaths(prev, { onDark: null, onLight: img('keep'), name: null })).toEqual(['old-d']);
    expect(supersededLogoPaths(emptyLogo(), next)).toEqual([]);
  });
});
