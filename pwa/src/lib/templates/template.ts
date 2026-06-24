/**
 * Template model (`templates/{templateId}`) — an admin-authored blueprint for a new
 * event. On create-from-template it clones: enabled departments + stages + the event
 * production record + per-stage production (house package) + default roles. Artist
 * Advances are NOT seeded (filled per artist). Admin-managed; field values only
 * (field *definitions* stay code-defined).
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
import { eventRoleSchema, type EventRole } from '@/lib/rbac/roles';
import {
  productionContactSchema,
  productionLinkSchema,
  type ProductionContact,
  type ProductionLink,
} from '@/lib/production/production';

export interface TemplateStage {
  id: string;
  name: string;
  order: number;
}

export interface TemplateMember {
  uid: string;
  role: EventRole;
}

export interface TemplateEventProduction {
  info: SectionContent;
  contacts: ProductionContact[];
  links: ProductionLink[];
}

/** Per-stage house-package defaults, keyed by the template-stage id. */
export type TemplateStageProduction = Record<string, { content: AdvanceContent }>;

export interface TemplateRecord {
  id: string;
  name: string;
  departmentIds: string[];
  stages: TemplateStage[];
  eventProduction: TemplateEventProduction;
  stageProduction: TemplateStageProduction;
  members: TemplateMember[];
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** Editable shape (what the admin authors; the service persists it). */
export interface TemplateInput {
  name: string;
  departmentIds: string[];
  stages: TemplateStage[];
  eventProduction: TemplateEventProduction;
  stageProduction: TemplateStageProduction;
  members: TemplateMember[];
}

const templateStageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number().optional(),
});

const templateMemberSchema = z.object({ uid: z.string().min(1), role: eventRoleSchema });

const eventProductionSchema = z
  .object({
    info: sectionContentSchema.optional(),
    contacts: z.array(productionContactSchema).optional(),
    links: z.array(productionLinkSchema).optional(),
  })
  .optional();

const stageProductionSchema = z
  .record(z.string(), z.object({ content: advanceContentSchema.optional() }))
  .optional();

const templateDocSchema = z.object({
  name: z.string().min(1),
  departmentIds: z.array(z.string()).optional(),
  stages: z.array(templateStageSchema).optional(),
  eventProduction: eventProductionSchema,
  stageProduction: stageProductionSchema,
  members: z.array(templateMemberSchema).optional(),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

export function parseTemplate(id: string, data: unknown): TemplateRecord {
  const doc = templateDocSchema.parse(data);
  const stageProduction: TemplateStageProduction = {};
  for (const [key, v] of Object.entries(doc.stageProduction ?? {})) {
    stageProduction[key] = { content: v.content ?? {} };
  }
  return {
    id,
    name: doc.name,
    departmentIds: doc.departmentIds ?? [],
    stages: (doc.stages ?? []).map((s) => ({ id: s.id, name: s.name, order: s.order ?? 0 })),
    eventProduction: {
      info: doc.eventProduction?.info ?? {},
      contacts: doc.eventProduction?.contacts ?? [],
      links: doc.eventProduction?.links ?? [],
    },
    stageProduction,
    members: doc.members ?? [],
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

export const templateNameSchema = z.string().trim().min(1, 'Template name is required.');

export function emptyTemplateInput(): TemplateInput {
  return {
    name: '',
    departmentIds: [],
    stages: [],
    eventProduction: { info: {}, contacts: [], links: [] },
    stageProduction: {},
    members: [],
  };
}
