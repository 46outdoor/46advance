import { describe, it, expect } from 'vitest';
import { formatMinutes, formatWallClockTime } from './formatting';

describe('formatMinutes', () => {
  it('formats hours and minutes compactly', () => {
    expect(formatMinutes(600)).toBe('10h');
    expect(formatMinutes(270)).toBe('4h 30m');
    expect(formatMinutes(45)).toBe('45m');
  });
});

describe('formatWallClockTime', () => {
  it('renders 12-hour wall-clock strings', () => {
    expect(formatWallClockTime('08:00')).toBe('8:00 AM');
    expect(formatWallClockTime('22:30')).toBe('10:30 PM');
    expect(formatWallClockTime('00:15')).toBe('12:15 AM');
  });
});
