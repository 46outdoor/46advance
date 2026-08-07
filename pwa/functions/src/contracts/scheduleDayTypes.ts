/**
 * Schedule day-type keys + labels — shared between the web client (via the `@contracts`
 * alias) and the backend (the calendar feed's digest SUMMARY falls back to the day-type
 * label when a day has no title). Pure constants, no imports — same constraint as the
 * callable schemas. UI-only concerns (day-card header colors, def lookup) stay client-side
 * in `pwa/src/lib/schedules/dayTypes.ts`.
 */
export const SCHEDULE_DAY_TYPE_KEYS = ['travel', 'loadIn', 'show', 'loadOut', 'offDay'] as const;
export type ScheduleDayType = (typeof SCHEDULE_DAY_TYPE_KEYS)[number];

export const SCHEDULE_DAY_TYPE_LABELS: Record<ScheduleDayType, string> = {
  travel: 'Travel',
  loadIn: 'Load In',
  show: 'Show',
  loadOut: 'Load Out',
  offDay: 'Off Day',
};
