import { describe, it, expect } from 'vitest';
import { formatMinutes, formatWallClockTime } from './formatting';

describe('formatMinutes', () => {
  it('formats hours and minutes compactly', () => {
    expect(formatMinutes(600)).toBe('10h');
    expect(formatMinutes(270)).toBe('4h 30m');
    expect(formatMinutes(45)).toBe('45m');
  });

  it('rounds the total first (fractional input never yields "1h 60m")', () => {
    expect(formatMinutes(119.5)).toBe('2h');
    expect(formatMinutes(119.4)).toBe('1h 59m');
  });
});

describe('formatWallClockTime', () => {
  it('renders 12-hour wall-clock strings', () => {
    expect(formatWallClockTime('08:00')).toBe('8:00 AM');
    expect(formatWallClockTime('22:30')).toBe('10:30 PM');
    expect(formatWallClockTime('00:15')).toBe('12:15 AM');
  });
});
