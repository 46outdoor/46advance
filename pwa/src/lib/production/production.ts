/**
 * Festival production record model. Event-level = tech-operational info + production
 * contacts + reference links (the per-stage technical record is added in 5.3). Internal
 * tech-facing content (see memory `audience-internal-tech`); the artist-facing packet is
 * only the styling reference. Doc: `events/{id}/production/record`.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import {
  advanceContentSchema,
  sectionContentSchema,
  type AdvanceContent,
  type SectionContent,
} from '@/lib/advances/fields';
import { parseSectionsMap, sectionsMapSchema, type AdvanceSections } from '@/lib/advances/sections';

export interface ProductionContact {
  role: string;
  name: string;
  phone: string;
  email: string;
}

export interface ProductionLink {
  label: string;
  url: string;
}

export interface EventProduction {
  info: SectionContent;
  contacts: ProductionContact[];
  links: ProductionLink[];
  updatedAt: Date | null;
}

export const productionContactSchema = z.object({
  role: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string(),
});

export const productionLinkSchema = z.object({ label: z.string(), url: z.string() });

const eventProductionDocSchema = z.object({
  info: sectionContentSchema.optional(),
  contacts: z.array(productionContactSchema).optional(),
  links: z.array(productionLinkSchema).optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

export function parseEventProduction(data: unknown): EventProduction {
  const doc = eventProductionDocSchema.parse(data);
  return {
    info: doc.info ?? {},
    contacts: doc.contacts ?? [],
    links: doc.links ?? [],
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

export const emptyEventProduction = (): EventProduction => ({
  info: {},
  contacts: [],
  links: [],
  updatedAt: null,
});

/** Per-stage technical production record (house package), department-keyed (production context). */
export interface StageProduction {
  sections: AdvanceSections;
  content: AdvanceContent;
  links: ProductionLink[];
  updatedAt: Date | null;
}

const stageProductionDocSchema = z.object({
  sections: sectionsMapSchema.optional(),
  content: advanceContentSchema.optional(),
  links: z.array(productionLinkSchema).optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

export function parseStageProduction(data: unknown): StageProduction {
  const doc = stageProductionDocSchema.parse(data);
  return {
    sections: parseSectionsMap(doc.sections ?? {}),
    content: doc.content ?? {},
    links: doc.links ?? [],
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

export const emptyStageProduction = (): StageProduction => ({
  sections: {},
  content: {},
  links: [],
  updatedAt: null,
});
