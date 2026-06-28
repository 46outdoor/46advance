import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './slug';

describe('slugify (functions)', () => {
  it('lowercases, hyphenates, trims', () => {
    expect(slugify('RTC Ashland')).toBe('rtc-ashland');
    expect(slugify('Rock the Country – Ashland, KY 2026')).toBe('rock-the-country-ashland-ky-2026');
  });
});

describe('uniqueSlug (functions)', () => {
  it('returns the base when free, suffixes on collision', () => {
    expect(uniqueSlug('rtc-ashland-26', [])).toBe('rtc-ashland-26');
    expect(uniqueSlug('rtc-ashland-26', ['rtc-ashland-26'])).toBe('rtc-ashland-26-2');
  });
});
