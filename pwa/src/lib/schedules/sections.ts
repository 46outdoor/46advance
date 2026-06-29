/**
 * Schedule section registry (Phase 12a). The six schedule sections (ROADMAP §5) and their
 * section-specific fields. Common item fields (title/time/location/notes/stage) live on the
 * item itself; these are the *extra* fields each section adds, stored in `item.fields`.
 * Code-defined for now — expected to be refined repeatedly.
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

export type ScheduleFieldType = 'text' | 'number' | 'select';

export interface ScheduleFieldDef {
  key: string;
  label: string;
  type: ScheduleFieldType;
  options?: readonly string[];
}

export interface ScheduleSectionDef {
  key: ScheduleSection;
  label: string;
  /** Section-specific fields (beyond the common title/time/location/notes/stage). */
  fields: readonly ScheduleFieldDef[];
  /** Show the optional advance/act link in the form (Show section). */
  linksAdvance?: boolean;
}

export const SCHEDULE_SECTIONS: readonly ScheduleSectionDef[] = [
  {
    key: 'production',
    label: 'Production',
    fields: [
      { key: 'kind', label: 'Kind', type: 'select', options: ['Load-in', 'Soundcheck', 'Doors', 'Load-out', 'Other'] },
    ],
  },
  { key: 'show', label: 'Show', fields: [], linksAdvance: true },
  {
    key: 'travel',
    label: 'Travel',
    fields: [
      { key: 'party', label: 'Who / party', type: 'text' },
      { key: 'mode', label: 'Mode', type: 'select', options: ['Flight', 'Drive', 'Train', 'Other'] },
      { key: 'carrier', label: 'Carrier', type: 'text' },
      { key: 'confirmation', label: 'Flight / Conf #', type: 'text' },
      { key: 'from', label: 'From', type: 'text' },
      { key: 'to', label: 'To', type: 'text' },
    ],
  },
  {
    key: 'transportation',
    label: 'Transportation',
    fields: [
      { key: 'vehicle', label: 'Vehicle', type: 'text' },
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'pickup', label: 'Pickup location', type: 'text' },
      { key: 'dropoff', label: 'Drop-off location', type: 'text' },
    ],
  },
  {
    key: 'labor',
    label: 'Stagehand labor',
    fields: [
      {
        key: 'callType',
        label: 'Call type',
        type: 'select',
        options: ['Stagehands', 'Riggers', 'Fork Op', 'Spot Op', 'Cam Op', 'Other'],
      },
      { key: 'crewCount', label: 'Quantity', type: 'number' },
    ],
  },
  { key: 'custom', label: 'Custom', fields: [] },
];

const BY_KEY = new Map<ScheduleSection, ScheduleSectionDef>(SCHEDULE_SECTIONS.map((s) => [s.key, s]));

export function scheduleSectionDef(key: ScheduleSection): ScheduleSectionDef {
  return BY_KEY.get(key) ?? SCHEDULE_SECTIONS[SCHEDULE_SECTIONS.length - 1];
}

/** Display label for a section, using the item's custom label for the custom section. */
export function scheduleSectionLabel(section: ScheduleSection, customLabel?: string | null): string {
  if (section === 'custom') return customLabel?.trim() || 'Custom';
  return scheduleSectionDef(section).label;
}
