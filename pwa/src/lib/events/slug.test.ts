import { describe, it, expect } from 'vitest';
import { defaultEventSlug, slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases, hyphenates, and trims', () => {
    expect(slugify('RTC Ashland')).toBe('rtc-ashland');
    expect(slugify('Rock the Country – Ashland, KY 2026')).toBe('rock-the-country-ashland-ky-2026');
    expect(slugify('  Multiple   Spaces!! ')).toBe('multiple-spaces');
  });

  it('folds accents to ASCII', () => {
    expect(slugify('Café del Mar')).toBe('cafe-del-mar');
  });
});

describe('defaultEventSlug', () => {
  it('uses booking label + 2-digit year (the RTC convention)', () => {
    expect(
      defaultEventSlug('RTC Ashland', 'Rock the Country – Ashland, KY 2026', new Date('2026-06-27')),
    ).toBe('rtc-ashland-26');
  });

  it('falls back to the name when there is no booking label', () => {
    expect(defaultEventSlug(null, 'Summerfest', new Date('2026-07-01'))).toBe('summerfest-26');
  });

  it('does not double-append a year already in the base', () => {
    expect(defaultEventSlug(null, 'Festival 2026', new Date(2026, 5, 1))).toBe('festival-2026');
  });

  it('omits the year when there is no start date', () => {
    expect(defaultEventSlug('RTC Ashland', 'x', null)).toBe('rtc-ashland');
  });
});

describe('uniqueSlug', () => {
  it('returns the base when free', () => {
    expect(uniqueSlug('rtc-ashland-26', [])).toBe('rtc-ashland-26');
  });

  it('appends -2, -3 on collision', () => {
    expect(uniqueSlug('rtc-ashland-26', ['rtc-ashland-26'])).toBe('rtc-ashland-26-2');
    expect(uniqueSlug('rtc-ashland-26', ['rtc-ashland-26', 'rtc-ashland-26-2'])).toBe('rtc-ashland-26-3');
  });
});
