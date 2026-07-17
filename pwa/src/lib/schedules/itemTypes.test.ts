import { describe, it, expect } from 'vitest';
import {
  SCHEDULE_ITEM_TYPES,
  scheduleItemTypeDef,
  scheduleItemTypeLabel,
  type ScheduleItemType,
} from './itemTypes';

describe('itemTypes registry', () => {
  it('defines the six types, each with a distinct color', () => {
    expect(SCHEDULE_ITEM_TYPES.map((t) => t.key)).toEqual([
      'production',
      'show',
      'travel',
      'transportation',
      'labor',
      'custom',
    ]);
    expect(new Set(SCHEDULE_ITEM_TYPES.map((t) => t.color)).size).toBe(SCHEDULE_ITEM_TYPES.length);
  });

  it('marks the specials: Show resolves placeholders, Labor carries crew lines', () => {
    expect(scheduleItemTypeDef('show').resolvesPlaceholders).toBe(true);
    expect(scheduleItemTypeDef('show').fields).toEqual([]);
    expect(scheduleItemTypeDef('labor').hasCrew).toBe(true);
  });

  it('applies the Stage sub-type to production/show/labor only', () => {
    const withStage = SCHEDULE_ITEM_TYPES.filter((t) => t.hasStage).map((t) => t.key);
    expect(withStage).toEqual(['production', 'show', 'labor']);
  });

  it('gives Location to production, labor, and custom (decision 20); not to show', () => {
    for (const key of ['production', 'labor', 'custom'] as const) {
      expect(scheduleItemTypeDef(key).fields.some((f) => f.key === 'location')).toBe(true);
    }
    expect(scheduleItemTypeDef('show').fields.some((f) => f.key === 'location')).toBe(false);
  });

  it('falls back to Custom for an unknown key', () => {
    expect(scheduleItemTypeDef('bogus' as ScheduleItemType).key).toBe('custom');
  });
});

describe('scheduleItemTypeLabel', () => {
  it('uses the registry label for fixed types', () => {
    expect(scheduleItemTypeLabel('transportation')).toBe('Transportation');
  });

  it('uses the user-named label for custom, falling back to "Custom"', () => {
    expect(scheduleItemTypeLabel('custom', 'Catering')).toBe('Catering');
    expect(scheduleItemTypeLabel('custom', '  ')).toBe('Custom');
    expect(scheduleItemTypeLabel('custom', null)).toBe('Custom');
  });
});
