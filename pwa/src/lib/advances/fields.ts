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

/** deptId -> field set. Empty for departments not yet built out. */
const DEPARTMENT_FIELDS: Record<string, readonly FieldDef[]> = {
  audio: AUDIO_FIELDS,
};

export function getDepartmentFields(deptId: string): readonly FieldDef[] {
  return DEPARTMENT_FIELDS[deptId] ?? [];
}

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
