/**
 * Schedule day-type registry (planning/SCHEDULE_REDESIGN.md § taxonomy). Five operational
 * day categories; the day-card header takes the type's color (white text on all five).
 * Muted seed palette — approved as the working set; contrast pass lands with the grid UI.
 */
export const SCHEDULE_DAY_TYPE_KEYS = ['travel', 'loadIn', 'show', 'loadOut', 'offDay'] as const;
export type ScheduleDayType = (typeof SCHEDULE_DAY_TYPE_KEYS)[number];

export interface ScheduleDayTypeDef {
  key: ScheduleDayType;
  label: string;
  /** Day-card header background. */
  color: string;
}

const OFF_DAY: ScheduleDayTypeDef = { key: 'offDay', label: 'Off Day', color: '#6f6f76' };

export const SCHEDULE_DAY_TYPES: readonly ScheduleDayTypeDef[] = [
  { key: 'travel', label: 'Travel', color: '#5c6b8a' },
  { key: 'loadIn', label: 'Load In', color: '#b3822f' },
  { key: 'show', label: 'Show', color: '#4a7c59' },
  { key: 'loadOut', label: 'Load Out', color: '#944040' },
  OFF_DAY,
];

const BY_KEY = new Map<ScheduleDayType, ScheduleDayTypeDef>(SCHEDULE_DAY_TYPES.map((d) => [d.key, d]));

/** Registry entry for a day type; unknown keys fall back to the neutral Off Day. */
export function scheduleDayTypeDef(key: ScheduleDayType): ScheduleDayTypeDef {
  return BY_KEY.get(key) ?? OFF_DAY;
}
