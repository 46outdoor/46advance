import { describe, expect, it } from 'vitest';
import { formatWallClock12h, formatWallClockRange } from './wallClock';

describe('formatWallClock12h', () => {
  it('formats morning, noon, midnight, and evening times', () => {
    expect(formatWallClock12h('08:00')).toBe('8:00 AM');
    expect(formatWallClock12h('00:30')).toBe('12:30 AM');
    expect(formatWallClock12h('12:00')).toBe('12:00 PM');
    expect(formatWallClock12h('12:05')).toBe('12:05 PM');
    expect(formatWallClock12h('23:45')).toBe('11:45 PM');
    expect(formatWallClock12h('13:07')).toBe('1:07 PM');
  });
});

describe('formatWallClockRange', () => {
  it('collapses a shared AM/PM suffix onto the end time', () => {
    expect(formatWallClockRange('08:00', '09:00')).toBe('8:00–9:00 AM');
    expect(formatWallClockRange('13:00', '17:30')).toBe('1:00–5:30 PM');
  });

  it('keeps both suffixes when they differ (incl. overnight wraps)', () => {
    expect(formatWallClockRange('11:30', '13:00')).toBe('11:30 AM–1:00 PM');
    expect(formatWallClockRange('23:30', '01:00')).toBe('11:30 PM–1:00 AM');
  });

  it('renders only the start when there is no end', () => {
    expect(formatWallClockRange('08:00', null)).toBe('8:00 AM');
  });
});
