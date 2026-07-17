import { describe, it, expect } from 'vitest';
import { DEFAULT_CREW_TYPES, parseCrewTypes } from './crewTypes';

describe('parseCrewTypes', () => {
  it('falls back to the seed when the doc is absent or empty', () => {
    expect(parseCrewTypes(undefined)).toEqual([...DEFAULT_CREW_TYPES]);
    expect(parseCrewTypes({})).toEqual([...DEFAULT_CREW_TYPES]);
    expect(parseCrewTypes({ types: [] })).toEqual([...DEFAULT_CREW_TYPES]);
    expect(parseCrewTypes({ types: ['  ', ''] })).toEqual([...DEFAULT_CREW_TYPES]);
  });

  it('trims entries and drops duplicates, preserving order', () => {
    expect(parseCrewTypes({ types: [' Stagehands ', 'Riggers', 'Stagehands'] })).toEqual([
      'Stagehands',
      'Riggers',
    ]);
  });

  it('rejects a malformed doc', () => {
    expect(() => parseCrewTypes({ types: 'Stagehands' })).toThrow();
  });
});
