/**
 * Festival model (`festivals/{festivalId}`) — the app-wide, admin-managed list of festivals
 * (Rock the Country, Tailgate N' Tallboys…). Each festival carries a name + its logo, maintained
 * once. Events reference a festival (`event.festivalId`): the festival's name feeds the composed
 * event name, and its logo auto-applies (overridable per event). Shared lib (admin manages,
 * events consume) — mirrors the departments pattern, plus a dual-variant logo.
 */
import { z } from 'zod';
import { logoSchema, parseLogo, type Logo } from '@/lib/branding/logo';

export interface FestivalRecord {
  id: string;
  name: string;
  /** The festival's mark (dual-variant); null until an admin uploads one. */
  logo: Logo | null;
  order: number;
}

const festivalDocSchema = z.object({
  name: z.string().min(1),
  logo: logoSchema.nullable().optional(),
  order: z.number().optional(),
});

export function parseFestival(id: string, data: unknown): FestivalRecord {
  const doc = festivalDocSchema.parse(data);
  return {
    id,
    name: doc.name,
    logo: doc.logo ? parseLogo(doc.logo) : null,
    order: doc.order ?? 0,
  };
}

/** Client-supplied fields when creating/renaming a festival (the logo is authored separately). */
export const festivalInputSchema = z.object({
  name: z.string().trim().min(1, 'Festival name is required.'),
});
export type FestivalInput = z.infer<typeof festivalInputSchema>;

/** Sort by explicit order, then name — the display order for pickers + admin. */
export function sortFestivals(festivals: readonly FestivalRecord[]): FestivalRecord[] {
  return [...festivals].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
