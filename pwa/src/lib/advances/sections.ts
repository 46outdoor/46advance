/**
 * Advance-section model: an advance has one section **per enabled department** (the
 * event's `departmentIds`). A section's key is a department id; its label comes from
 * the department record. This file owns the status state machine + finalize/unlock
 * predicates. Rich per-department content (fields) lands in Phase 4.
 */
import { z } from 'zod';
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
