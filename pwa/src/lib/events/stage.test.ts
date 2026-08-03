import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { parseStage, slotBaselineKey, stageInputSchema } from './stage';

describe('parseStage', () => {
  it('parses fields and defaults order to 0', () => {
    const s = parseStage('stg-1', {
      name: 'Main Stage',
      createdAt: Timestamp.fromDate(new Date('2026-06-23T00:00:00Z')),
    });
    expect(s.id).toBe('stg-1');
    expect(s.name).toBe('Main Stage');
    expect(s.order).toBe(0);
    expect(s.notes).toBeNull();
    expect(s.slotBaselines).toEqual({});
    expect(s.createdAt?.toISOString()).toBe('2026-06-23T00:00:00.000Z');
  });

  it('parses persisted slot baselines (per show day)', () => {
    const s = parseStage('stg-1', {
      name: 'Main Stage',
      slotBaselines: { '2026-08-14': 6, default: 3 },
    });
    expect(s.slotBaselines).toEqual({ '2026-08-14': 6, default: 3 });
  });

  it('throws on a missing name', () => {
    expect(() => parseStage('x', { order: 1 })).toThrow();
  });
});

describe('slotBaselineKey', () => {
  it('maps a day key through and the undated group to "default"', () => {
    expect(slotBaselineKey('2026-08-14')).toBe('2026-08-14');
    expect(slotBaselineKey('')).toBe('default');
  });
});

describe('stageInputSchema', () => {
  it('requires a non-empty name', () => {
    expect(stageInputSchema.parse({ name: 'Second Stage' }).name).toBe('Second Stage');
    expect(() => stageInputSchema.parse({ name: '  ' })).toThrow();
  });
});
