import { describe, it, expect } from 'vitest';
import { isValidDateKey } from './parsing';

describe('isValidDateKey', () => {
  it('accepts real calendar dates', () => {
    expect(isValidDateKey('2026-07-14')).toBe(true);
    expect(isValidDateKey('2028-02-29')).toBe(true); // leap day
  });

  it('rejects rollover dates the regex alone would pass', () => {
    expect(isValidDateKey('2026-02-31')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-02-29')).toBe(false); // not a leap year
  });

  it('rejects non-date strings', () => {
    expect(isValidDateKey('07/14/2026')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
  });
});
