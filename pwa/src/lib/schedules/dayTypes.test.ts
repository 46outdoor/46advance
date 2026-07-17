import { describe, it, expect } from 'vitest';
import { SCHEDULE_DAY_TYPES, scheduleDayTypeDef, type ScheduleDayType } from './dayTypes';

describe('dayTypes registry', () => {
  it('defines the five day types in event-arc order, each with a distinct color', () => {
    expect(SCHEDULE_DAY_TYPES.map((d) => d.key)).toEqual(['travel', 'loadIn', 'show', 'loadOut', 'offDay']);
    expect(new Set(SCHEDULE_DAY_TYPES.map((d) => d.color)).size).toBe(SCHEDULE_DAY_TYPES.length);
  });

  it('looks up a def by key and falls back to Off Day for an unknown key', () => {
    expect(scheduleDayTypeDef('loadIn').label).toBe('Load In');
    expect(scheduleDayTypeDef('bogus' as ScheduleDayType).key).toBe('offDay');
  });
});
