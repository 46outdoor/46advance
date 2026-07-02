/**
 * Advance-section model: an advance has one section **per enabled department** (the
 * event's `departmentIds`). A section's key is a department id; its label comes from
 * the department record. This file owns the status state machine + finalize/unlock
 * predicates. Rich per-department content (fields) lands in Phase 4.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import { canEditEvent, type Viewer } from '@/lib/rbac/permissions';
import type { EventRole } from '@/lib/rbac/roles';

/** A section key is a department id. */
export type SectionKey = string;

/** not started (neutral) → in progress (amber) → complete (green, locked). */
export const SECTION_STATUSES = ['not_started', 'in_progress', 'complete'] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];
export const sectionStatusSchema = z.enum(SECTION_STATUSES);

export interface AdvanceSectionState {
  status: SectionStatus;
  finalizedAt: Date | null;
  finalizedBy: string | null;
}

/** Sections keyed by department id. */
export type AdvanceSections = Record<string, AdvanceSectionState>;

/** A fresh advance: one not-started section per enabled department. */
export function initialSections(departmentIds: readonly string[]): AdvanceSections {
  return Object.fromEntries(
    departmentIds.map((id) => [id, { status: 'not_started', finalizedAt: null, finalizedBy: null }]),
  );
}

/**
 * The effective state of a department's section on an advance. A section that's absent — e.g. a
 * department enabled AFTER the advance was created — counts as a fresh `not_started` section, so
 * every currently-enabled department is accounted for. Single source of this rule shared by the
 * advance detail screen and the tracker roll-up, so their completion denominators agree.
 */
export function sectionStateFor(sections: AdvanceSections, deptId: string): AdvanceSectionState {
  return sections[deptId] ?? { status: 'not_started', finalizedAt: null, finalizedBy: null };
}

const sectionStateDocSchema = z.object({
  status: sectionStatusSchema,
  finalizedAt: z.instanceof(Timestamp).nullable().optional(),
  finalizedBy: z.string().nullable().optional(),
});

/** Zod schema for a raw `sections` map (department-keyed). */
export const sectionsMapSchema = z.record(z.string(), sectionStateDocSchema);

/** Validate + normalize a raw sections map (Timestamp → Date). Shared by advances + production. */
export function parseSectionsMap(raw: unknown): AdvanceSections {
  const parsed = sectionsMapSchema.parse(raw ?? {});
  const out: AdvanceSections = {};
  for (const [key, v] of Object.entries(parsed)) {
    out[key] = {
      status: v.status,
      finalizedAt: timestampToDate(v.finalizedAt ?? null),
      finalizedBy: v.finalizedBy ?? null,
    };
  }
  return out;
}

const ALLOWED_TRANSITIONS: Record<SectionStatus, readonly SectionStatus[]> = {
  not_started: ['in_progress'],
  in_progress: ['not_started', 'complete'], // complete = finalize
  complete: ['in_progress'], // = unlock
};

/** Is moving a section from `from` → `to` allowed by the state machine? (No-op allowed.) */
export function isValidSectionTransition(from: SectionStatus, to: SectionStatus): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

/** PM + admin may finalize (lock) a section. */
export function canFinalizeSection(viewer: Viewer, role: EventRole | null): boolean {
  return canEditEvent(viewer, role);
}

/** PM + admin may unlock a finalized section (decision: same as edit scope). */
export function canUnlockSection(viewer: Viewer, role: EventRole | null): boolean {
  return canEditEvent(viewer, role);
}
