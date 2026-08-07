/**
 * Schedule day-type registry (planning/archive/feature/SCHEDULE_REDESIGN.md § taxonomy). Five operational
 * day categories; the day-card header takes the type's color (white text on all five).
 * Muted seed palette — approved as the working set; contrast pass lands with the grid UI.
 *
 * Keys + labels are the shared contract (`@contracts/scheduleDayTypes`) — the backend
 * renders the same labels in the calendar feed digest. Colors and the def lookup are
 * client-only and stay here.
 */
import {
  SCHEDULE_DAY_TYPE_KEYS,
  SCHEDULE_DAY_TYPE_LABELS,
  type ScheduleDayType,
} from '@contracts/scheduleDayTypes';

export { SCHEDULE_DAY_TYPE_KEYS };
export type { ScheduleDayType };

export interface ScheduleDayTypeDef {
  key: ScheduleDayType;
  label: string;
  /** Day-card header background. */
  color: string;
}

const COLORS: Record<ScheduleDayType, string> = {
  travel: '#5c6b8a',
  loadIn: '#b3822f',
  show: '#4a7c59',
  loadOut: '#944040',
  offDay: '#6f6f76',
};

export const SCHEDULE_DAY_TYPES: readonly ScheduleDayTypeDef[] = SCHEDULE_DAY_TYPE_KEYS.map(
  (key) => ({ key, label: SCHEDULE_DAY_TYPE_LABELS[key], color: COLORS[key] }),
);

const BY_KEY = new Map<ScheduleDayType, ScheduleDayTypeDef>(SCHEDULE_DAY_TYPES.map((d) => [d.key, d]));
const OFF_DAY = BY_KEY.get('offDay')!;

/** Registry entry for a day type; unknown keys fall back to the neutral Off Day. */
export function scheduleDayTypeDef(key: ScheduleDayType): ScheduleDayTypeDef {
  return BY_KEY.get(key) ?? OFF_DAY;
}
