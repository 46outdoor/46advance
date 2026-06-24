import { describe, it, expect } from 'vitest';
import { getDepartmentFields, sectionContentSchema, sectionHasData } from './fields';

describe('field registry', () => {
  it('returns the Audio field set and empty for unknown departments', () => {
    expect(getDepartmentFields('audio').length).toBeGreaterThan(0);
    expect(getDepartmentFields('lighting')).toEqual([]);
    expect(getDepartmentFields('nope')).toEqual([]);
  });

  it('Audio fields all have a key, label, and type', () => {
    for (const f of getDepartmentFields('audio')) {
      expect(f.key).toBeTruthy();
      expect(f.label).toBeTruthy();
      expect(['text', 'longtext', 'number', 'boolean', 'select']).toContain(f.type);
    }
  });
});

describe('sectionHasData', () => {
  it('detects meaningful data', () => {
    expect(sectionHasData(undefined)).toBe(false);
    expect(sectionHasData({})).toBe(false);
    expect(sectionHasData({ a: '', b: '   ' })).toBe(false);
    expect(sectionHasData({ a: false })).toBe(false);
    expect(sectionHasData({ a: 0 })).toBe(false);
    expect(sectionHasData({ a: 'X-32' })).toBe(true);
    expect(sectionHasData({ a: true })).toBe(true);
    expect(sectionHasData({ a: 3 })).toBe(true);
  });
});

describe('sectionContentSchema', () => {
  it('accepts string/number/boolean/null values', () => {
    expect(sectionContentSchema.parse({ a: 'x', b: 2, c: true, d: null })).toEqual({
      a: 'x',
      b: 2,
      c: true,
      d: null,
    });
  });

  it('rejects nested objects', () => {
    expect(() => sectionContentSchema.parse({ a: { nested: 1 } })).toThrow();
  });
});
