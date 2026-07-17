import { describe, it, expect } from 'vitest';
import { spanMinutes } from './calculations';

describe('spanMinutes', () => {
  it('computes a same-day span and wraps overnight', () => {
    expect(spanMinutes('08:00', '18:00')).toBe(600);
    expect(spanMinutes('22:00', '02:00')).toBe(240);
  });

  it('returns null for missing times or a zero span', () => {
    expect(spanMinutes(null, '10:00')).toBeNull();
    expect(spanMinutes('10:00', null)).toBeNull();
    expect(spanMinutes('10:00', '10:00')).toBeNull();
  });
});
