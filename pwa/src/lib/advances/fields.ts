/**
 * Per-department content field registry. A department's section renders these fields;
 * values live in `advance.content[deptId]`. Code-defined (admin-editable field sets /
 * form-builder come with templates in Phase 5). Audio is populated; other departments
 * get their field sets in later content phases.
 */
import { z } from 'zod';

export type FieldType = 'text' | 'longtext' | 'number' | 'boolean' | 'select';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Optional grouping header within a department's form. */
  group?: string;
  /** Options for `select`. */
  options?: readonly string[];
}

export type FieldValue = string | number | boolean | null;
export type SectionContent = Record<string, FieldValue>;

export const fieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const sectionContentSchema = z.record(z.string(), fieldValueSchema);
/** All advance content: deptId -> field map. */
export const advanceContentSchema = z.record(z.string(), sectionContentSchema);
export type AdvanceContent = Record<string, SectionContent>;

/** Audio department fields, grouped (from AUDIO_ADVANCE_REFERENCE.md). */
const AUDIO_FIELDS: readonly FieldDef[] = [
  { key: 'foh_console', label: 'FOH console', type: 'text', group: 'Consoles' },
  { key: 'mon_console', label: 'MON console', type: 'text', group: 'Consoles' },
  { key: 'playback', label: 'Playback', type: 'text', group: 'Consoles' },
  { key: 'other_tech', label: 'Other tech worlds', type: 'text', group: 'Consoles' },
  { key: 'snake', label: 'Snake', type: 'text', group: 'Signal' },
  { key: 'sub_snakes', label: 'Sub snakes', type: 'text', group: 'Signal' },
  { key: 'sub_snake_boxes', label: 'Sub-snake boxes', type: 'text', group: 'Signal' },
  { key: 'patch_notes', label: 'Patch notes', type: 'longtext', group: 'Signal' },
  { key: 'mics_dis', label: 'Mics & DIs', type: 'longtext', group: 'Signal' },
  { key: 'stands_xlr', label: 'Stands & XLR', type: 'text', group: 'Signal' },
  { key: 'mon_needs', label: 'Monitor needs', type: 'longtext', group: 'Monitors / RF' },
  { key: 'rf', label: 'RF', type: 'text', group: 'Monitors / RF' },
  { key: 'iem', label: 'IEM', type: 'text', group: 'Monitors / RF' },
  { key: 'com', label: 'COM / shout', type: 'text', group: 'Monitors / RF' },
  { key: 'power_needs', label: 'Power needs', type: 'text', group: 'Power' },
  { key: 'rider_received', label: 'Production rider received', type: 'boolean', group: 'Documents' },
  { key: 'stage_plot_received', label: 'Stage plot received', type: 'boolean', group: 'Documents' },
  { key: 'input_list_received', label: 'Input list received', type: 'boolean', group: 'Documents' },
];

/** deptId -> field set, per context. Advance = per-artist; production = house package. */
const ADVANCE_FIELDS: Record<string, readonly FieldDef[]> = {
  audio: AUDIO_FIELDS,
};

/**
 * Per-stage production (house package) fields — tech-operational (internal app; see
 * memory `audience-internal-tech`). Starter sets from PRODUCTION_ADVANCE_REFERENCE.md.
 */
const PRODUCTION_FIELDS: Record<string, readonly FieldDef[]> = {
  staging: [
    { key: 'builder_model', label: 'Stage builder / model', type: 'text', group: 'Deck' },
    { key: 'main_deck', label: 'Main deck', type: 'text', group: 'Deck' },
    { key: 'thrust_landing', label: 'Thrust + landing', type: 'text', group: 'Deck' },
    { key: 'wings', label: 'Wings', type: 'text', group: 'Deck' },
    { key: 'wing_extensions', label: 'Wing extensions', type: 'text', group: 'Deck' },
    { key: 'crossover', label: 'Crossover', type: 'text', group: 'Deck' },
    { key: 'loading_dock', label: 'Loading dock / ramp', type: 'text', group: 'Deck' },
    { key: 'foh_deck', label: 'FOH deck + cover', type: 'text', group: 'Structures' },
    { key: 'scissor_lift', label: 'Scissor lift', type: 'text', group: 'Structures' },
    { key: 'camera_risers', label: 'Camera risers', type: 'text', group: 'Structures' },
    { key: 'towers', label: 'Delay / side-hang towers', type: 'text', group: 'Structures' },
    { key: 'rigging_notes', label: 'Rigging notes', type: 'longtext', group: 'Structures' },
  ],
  audio: [
    { key: 'main_pa', label: 'Main PA / speakers', type: 'longtext', group: 'PA' },
    { key: 'foh_drive', label: 'FOH drive / control', type: 'text', group: 'PA' },
    { key: 'foh_console', label: 'FOH console', type: 'text', group: 'Consoles' },
    { key: 'mon_console', label: 'MON console', type: 'text', group: 'Consoles' },
    { key: 'mon_package', label: 'Monitor package', type: 'longtext', group: 'Consoles' },
    { key: 'mics_accessories', label: 'Mics & accessories (festival package)', type: 'longtext', group: 'Mics / RF' },
    { key: 'stage_power', label: 'Stage power', type: 'text', group: 'Infra' },
    { key: 'intercom', label: 'Intercom', type: 'text', group: 'Infra' },
    { key: 'shout', label: 'Shout system', type: 'text', group: 'Infra' },
    { key: 'system_techs', label: 'System techs', type: 'number', group: 'Crew' },
    { key: 'audio_techs', label: 'Audio techs', type: 'number', group: 'Crew' },
  ],
  lighting: [
    { key: 'fixtures', label: 'Fixtures', type: 'longtext', group: 'Rig' },
    { key: 'follow_spots', label: 'Follow spots', type: 'text', group: 'Rig' },
    { key: 'hazers', label: 'Hazers', type: 'text', group: 'Rig' },
    { key: 'console', label: 'Console', type: 'text', group: 'Control' },
    { key: 'plot_link', label: 'Plot / CAD link', type: 'text', group: 'Control' },
  ],
  'video-led': [
    { key: 'led_walls', label: 'LED walls', type: 'longtext', group: 'LED' },
    { key: 'video_switcher', label: 'Video switcher', type: 'text', group: 'Video' },
    { key: 'router', label: 'Router', type: 'text', group: 'Video' },
    { key: 'cameras', label: 'Cameras', type: 'longtext', group: 'Video' },
    { key: 'lenses', label: 'Lenses', type: 'longtext', group: 'Video' },
  ],
};

export type FieldContext = 'advance' | 'production';

export function getDepartmentFields(deptId: string, context: FieldContext = 'advance'): readonly FieldDef[] {
  const map = context === 'production' ? PRODUCTION_FIELDS : ADVANCE_FIELDS;
  return map[deptId] ?? [];
}

/** Event-level production record fields — tech-operational (not artist policy). */
export const EVENT_PRODUCTION_FIELDS: readonly FieldDef[] = [
  { key: 'site_access', label: 'Site access / arrival', type: 'longtext', group: 'Site' },
  { key: 'production_schedule', label: 'Production schedule', type: 'longtext', group: 'Site' },
  { key: 'site_power', label: 'Site power / distro', type: 'longtext', group: 'Infra' },
  { key: 'comms_rf', label: 'Comms / RF coordination', type: 'longtext', group: 'Infra' },
  { key: 'crew_catering', label: 'Crew catering', type: 'text', group: 'Crew' },
  { key: 'crew_parking', label: 'Crew parking', type: 'text', group: 'Crew' },
  { key: 'production_office', label: 'Production office', type: 'text', group: 'Crew' },
  { key: 'crew_credentials', label: 'Crew credentials', type: 'text', group: 'Crew' },
  { key: 'notes', label: 'Notes', type: 'longtext', group: 'Crew' },
];

/** Whether a section's content holds any meaningful data (drives auto in-progress). */
export function sectionHasData(content: SectionContent | undefined): boolean {
  if (!content) return false;
  return Object.values(content).some((v) => {
    if (typeof v === 'string') return v.trim().length > 0;
    if (typeof v === 'number') return v > 0;
    if (typeof v === 'boolean') return v;
    return false;
  });
}
