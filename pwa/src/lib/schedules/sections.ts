/**
 * Pre-redesign schedule section keys (Phase 12a) — retiring. Only the old scheduleItem
 * model still imports the key list; everything else lives in the redesign registries
 * (dayTypes.ts / itemTypes.ts). Deleted with the old model in the redesign cleanup.
 */
export const SCHEDULE_SECTION_KEYS = [
  'production',
  'show',
  'travel',
  'transportation',
  'labor',
  'custom',
] as const;
export type ScheduleSection = (typeof SCHEDULE_SECTION_KEYS)[number];

// The field-def type is canonical in the redesign registry (itemTypes.ts) — re-exported
// here so this retiring module's consumers keep working until they migrate.
export type { ScheduleFieldDef } from './itemTypes';
