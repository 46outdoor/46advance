import { describe, it, expect } from 'vitest';
import {
  SECTION_KEYS,
  canFinalizeSection,
  canUnlockSection,
  initialSections,
  isValidSectionTransition,
} from './sections';
import type { Viewer } from '@/lib/rbac/permissions';

const admin: Viewer = { uid: 'a', isAdmin: true };
const member: Viewer = { uid: 'u', isAdmin: false };

describe('section state machine', () => {
  it('initialSections sets every standard slot to not_started', () => {
    const s = initialSections();
    expect(Object.keys(s).sort()).toEqual([...SECTION_KEYS].sort());
    for (const key of SECTION_KEYS) {
      expect(s[key]).toEqual({ status: 'not_started', finalizedAt: null, finalizedBy: null });
    }
  });

  it('allows the forward path and unlock', () => {
    expect(isValidSectionTransition('not_started', 'in_progress')).toBe(true);
    expect(isValidSectionTransition('in_progress', 'complete')).toBe(true); // finalize
    expect(isValidSectionTransition('complete', 'in_progress')).toBe(true); // unlock
    expect(isValidSectionTransition('in_progress', 'not_started')).toBe(true);
    expect(isValidSectionTransition('complete', 'complete')).toBe(true); // no-op
  });

  it('rejects illegal jumps', () => {
    expect(isValidSectionTransition('not_started', 'complete')).toBe(false);
    expect(isValidSectionTransition('complete', 'not_started')).toBe(false);
  });
});

describe('section finalize/unlock permissions', () => {
  it('admin and production-manager can finalize and unlock', () => {
    expect(canFinalizeSection(admin, null)).toBe(true);
    expect(canFinalizeSection(member, 'production-manager')).toBe(true);
    expect(canUnlockSection(member, 'production-manager')).toBe(true);
  });

  it('department-lead and tech cannot finalize or unlock', () => {
    expect(canFinalizeSection(member, 'department-lead')).toBe(false);
    expect(canFinalizeSection(member, 'tech')).toBe(false);
    expect(canUnlockSection(member, 'department-lead')).toBe(false);
    expect(canUnlockSection(member, null)).toBe(false);
  });
});
