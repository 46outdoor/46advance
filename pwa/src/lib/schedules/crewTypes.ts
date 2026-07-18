/**
 * Crew-type config model (`config/crewTypes`) — the admin-editable list of labor crew
 * types offered on crew lines (planning/archive/feature/SCHEDULE_REDESIGN.md decision 21). Reads fall
 * back to the seed when the doc is absent (the branding-config pattern); the IO service
 * and admin edit screen land with the template-editor PR. Rules: any approved user
 * reads, admin writes (the existing `config/{configId}` block).
 */
import { z } from 'zod';

export const DEFAULT_CREW_TYPES: readonly string[] = [
  'Stagehands',
  'Riggers / Climbers',
  'Fork / Lull Operators',
];

const crewTypesDocSchema = z.object({
  types: z.array(z.string()).optional(),
});

/** Validate + normalize the crew-types config doc: trims entries, drops blanks and
 * duplicates (order-preserving). An absent doc (`undefined`, e.g. `snap.data()` on a
 * missing document) or an empty list falls back to the seed; a malformed present doc
 * still fails validation. */
export function parseCrewTypes(data: unknown): string[] {
  const doc = crewTypesDocSchema.parse(data === undefined ? {} : data);
  const cleaned = [...new Set((doc.types ?? []).map((t) => t.trim()).filter(Boolean))];
  return cleaned.length > 0 ? cleaned : [...DEFAULT_CREW_TYPES];
}
