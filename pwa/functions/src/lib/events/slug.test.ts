import { describe, expect, it } from 'vitest';
import { slugCandidates, slugify } from './slug';

describe('slugify (functions)', () => {
  it('lowercases, hyphenates, trims', () => {
    expect(slugify('RTC Ashland')).toBe('rtc-ashland');
    expect(slugify('Rock the Country – Ashland, KY 2026')).toBe('rock-the-country-ashland-ky-2026');
  });
});

describe('slugCandidates (functions)', () => {
  function take(base: string, n: number): string[] {
    const out: string[] = [];
    for (const c of slugCandidates(base)) {
      out.push(c);
      if (out.length === n) break;
    }
    return out;
  }

  it('yields the base first, then -2, -3, … on collision', () => {
    expect(take('rtc-ashland-26', 3)).toEqual(['rtc-ashland-26', 'rtc-ashland-26-2', 'rtc-ashland-26-3']);
  });

  it('falls back to the `event` stem so a slug is never empty', () => {
    expect(take('', 2)).toEqual(['event-2', 'event-3']);
  });
});
