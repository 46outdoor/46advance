/**
 * Canonical advance-section model: the standard section slots, their status
 * state machine, and the capability predicates for finalize/unlock. Shared lib
 * (consumed by the advances feature, the tracker, and rules-mirroring tests) —
 * not a feature, so it's import-safe everywhere. Rich section *content* (fields)
 * lands in Phase 4; Phase 2 owns the status + finalize/lock metadata.
 */
import { z } from 'zod';
import { canEditEvent, type Viewer } from '@/lib/rbac/permissions';
import type { EventRole } from '@/lib/rbac/roles';

/** Standard section slots (v1). Custom schedule sections arrive in Phase 4. */
export const SECTION_KEYS = [
  'transportation',
  'production-schedule',
  'show-schedule',
  'travel-schedule',
  'labor-schedule',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** Human labels for the slots (UI). */
export const SECTION_LABELS: Record<SectionKey, string> = {
  transportation: 'Transportation',
  'production-schedule': 'Production schedule',
  'show-schedule': 'Show schedule',
  'travel-schedule': 'Travel schedule',
  'labor-schedule': 'Stagehand labor',
};

/** not started (neutral) → in progress (amber) → complete (green, locked). */
export const SECTION_STATUSES = ['not_started', 'in_progress', 'complete'] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];
export const sectionStatusSchema = z.enum(SECTION_STATUSES);

export interface AdvanceSectionState {
  status: SectionStatus;
  finalizedAt: Date | null;
  finalizedBy: string | null;
}

/** Every standard section is always present on a parsed advance. */
export type AdvanceSections = Record<SectionKey, AdvanceSectionState>;

/** A fresh advance: every section not started. */
export function initialSections(): AdvanceSections {
  return Object.fromEntries(
    SECTION_KEYS.map((key) => [key, { status: 'not_started', finalizedAt: null, finalizedBy: null }]),
  ) as AdvanceSections;
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
