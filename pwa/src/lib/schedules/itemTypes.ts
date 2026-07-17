/**
 * Schedule item-type registry (planning/SCHEDULE_REDESIGN.md § taxonomy) — successor to
 * the section registry of the pre-redesign model (sections.ts, retired with it). An item's
 * type renders as a color dot with a tooltip naming the type; each type declares whether
 * the Stage sub-type applies, its flat detail fields (shown as a muted sub-row when
 * populated), and its specials — Show resolves `{artist N}` placeholders, Labor carries
 * repeating crew lines.
 */
export const SCHEDULE_ITEM_TYPE_KEYS = [
  'production',
  'show',
  'travel',
  'transportation',
  'labor',
  'custom',
] as const;
export type ScheduleItemType = (typeof SCHEDULE_ITEM_TYPE_KEYS)[number];

export type ScheduleFieldType = 'text' | 'number' | 'select';

export interface ScheduleFieldDef {
  key: string;
  label: string;
  type: ScheduleFieldType;
  options?: readonly string[];
}

export interface ScheduleItemTypeDef {
  key: ScheduleItemType;
  label: string;
  /** Type-dot color (muted register; distinct from the brand accent). */
  color: string;
  /** The Stage sub-type (filterable modifier) applies to this type. */
  hasStage: boolean;
  /** Flat per-type detail fields, stored in `item.fields`. */
  fields: readonly ScheduleFieldDef[];
  /** `{artist N}` placeholders resolve against this item's stage (Show). */
  resolvesPlaceholders?: boolean;
  /** Repeating crew lines apply (Labor). */
  hasCrew?: boolean;
}

const LOCATION_FIELD: ScheduleFieldDef = { key: 'location', label: 'Location', type: 'text' };

const CUSTOM: ScheduleItemTypeDef = {
  key: 'custom',
  label: 'Custom',
  color: '#6f6f76',
  hasStage: false,
  fields: [LOCATION_FIELD],
};

export const SCHEDULE_ITEM_TYPES: readonly ScheduleItemTypeDef[] = [
  { key: 'production', label: 'Production', color: '#557a95', hasStage: true, fields: [LOCATION_FIELD] },
  { key: 'show', label: 'Show', color: '#4a7c59', hasStage: true, fields: [], resolvesPlaceholders: true },
  {
    key: 'travel',
    label: 'Travel',
    color: '#7d6ba0',
    hasStage: false,
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
    color: '#4f7d78',
    hasStage: false,
    fields: [
      { key: 'vehicle', label: 'Vehicle', type: 'text' },
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'pickup', label: 'Pickup location', type: 'text' },
      { key: 'dropoff', label: 'Drop-off location', type: 'text' },
    ],
  },
  { key: 'labor', label: 'Labor', color: '#8a5a83', hasStage: true, fields: [LOCATION_FIELD], hasCrew: true },
  CUSTOM,
];

const BY_KEY = new Map<ScheduleItemType, ScheduleItemTypeDef>(SCHEDULE_ITEM_TYPES.map((t) => [t.key, t]));

/** Registry entry for an item type; unknown keys fall back to Custom. */
export function scheduleItemTypeDef(key: ScheduleItemType): ScheduleItemTypeDef {
  return BY_KEY.get(key) ?? CUSTOM;
}

/** Tooltip/display label for an item's type — a custom type shows its user-named label. */
export function scheduleItemTypeLabel(type: ScheduleItemType, customLabel?: string | null): string {
  if (type === 'custom') return customLabel?.trim() || 'Custom';
  return scheduleItemTypeDef(type).label;
}
