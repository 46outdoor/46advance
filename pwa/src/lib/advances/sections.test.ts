import { describe, it, expect } from 'vitest';
import {
  canFinalizeSection,
  canUnlockSection,
  initialSections,
  isValidSectionTransition,
} from './sections';
import type { Viewer } from '@/lib/rbac/permissions';

const admin: Viewer = { uid: 'a', isAdmin: true };
const member: Viewer = { uid: 'u', isAdmin: false };

describe('section state machine', () => {
  it('initialSections seeds one not_started section per department', () => {
    const s = initialSections(['audio', 'lighting']);
    expect(Object.keys(s).sort()).toEqual(['audio', 'lighting']);
    expect(s.audio).toEqual({ status: 'not_started', finalizedAt: null, finalizedBy: null });
  });

  it('empty department list → no sections', () => {
    expect(initialSections([])).toEqual({});
  });

  it('allows the forward path and unlock', () => {
    expect(isValidSectionTransition('not_started', 'in_progress')).toBe(true);
    expect(isValidSectionTransition('in_progress', 'complete')).toBe(true); // finalize
    expect(isValidSectionTransition('complete', 'in_progress')).toBe(true); // unlock
    expect(isValidSectionTransition('complete', 'complete')).toBe(true); // no-op
  });

  it('rejects illegal jumps', () => {
    expect(isValidSectionTransition('not_started', 'complete')).toBe(false);
    expect(isValidSectionTransition('complete', 'not_started')).toBe(false);
  });
});

describe('section finalize/unlock permissions', () => {
  it('admin and production-manager can finalize and unlock any section', () => {
    expect(canFinalizeSection(admin, null, 'audio')).toBe(true);
    expect(canFinalizeSection(member, { role: 'production-manager' }, 'audio')).toBe(true);
    expect(canUnlockSection(member, { role: 'production-manager' }, 'audio')).toBe(true);
  });

  it('department-lead can finalize and unlock only their assigned departments', () => {
    const lead = { role: 'department-lead', departments: ['audio'] } as const;
    expect(canFinalizeSection(member, lead, 'audio')).toBe(true);
    expect(canUnlockSection(member, lead, 'audio')).toBe(true);
    expect(canFinalizeSection(member, lead, 'lighting')).toBe(false);
    expect(canUnlockSection(member, lead, 'lighting')).toBe(false);
  });

  it('unassigned department-lead and tech cannot finalize or unlock', () => {
    expect(canFinalizeSection(member, { role: 'department-lead' }, 'audio')).toBe(false);
    expect(canFinalizeSection(member, { role: 'tech' }, 'audio')).toBe(false);
    expect(canUnlockSection(member, null, 'audio')).toBe(false);
  });
});
