import { describe, it, expect } from 'vitest';
import {
  canCreateEvents,
  canEditDepartment,
  canEditEvent,
  canFlag,
  canManageMembers,
  canViewEvent,
  isAdmin,
} from './permissions';
import type { Viewer } from './permissions';

const admin: Viewer = { uid: 'admin-1', isAdmin: true };
const member: Viewer = { uid: 'user-1', isAdmin: false };

describe('permissions — event creation (global capability)', () => {
  it('admin and organizers may create events; plain members may not', () => {
    expect(canCreateEvents(admin)).toBe(true);
    expect(canCreateEvents({ uid: 'o', isAdmin: false, isOrganizer: true })).toBe(true);
    expect(canCreateEvents(member)).toBe(false);
  });
});

describe('permissions — global admin', () => {
  it('admin can do everything regardless of per-event role', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(canViewEvent(admin, null)).toBe(true);
    expect(canEditEvent(admin, null)).toBe(true);
    expect(canFlag(admin, null)).toBe(true);
    expect(canManageMembers(admin, null)).toBe(true);
    expect(canEditDepartment(admin, null, 'audio')).toBe(true);
  });
});

describe('permissions — per-event capability matrix (non-admin)', () => {
  it('non-member: no access', () => {
    expect(canViewEvent(member, null)).toBe(false);
    expect(canEditEvent(member, null)).toBe(false);
    expect(canFlag(member, null)).toBe(false);
    expect(canManageMembers(member, null)).toBe(false);
    expect(canEditDepartment(member, null, 'audio')).toBe(false);
  });

  it('tech: view only', () => {
    expect(canViewEvent(member, 'tech')).toBe(true);
    expect(canEditEvent(member, 'tech')).toBe(false);
    expect(canFlag(member, 'tech')).toBe(false);
  });

  it('department-lead: view + flag, no whole-event edit', () => {
    expect(canViewEvent(member, 'department-lead')).toBe(true);
    expect(canFlag(member, 'department-lead')).toBe(true);
    expect(canEditEvent(member, 'department-lead')).toBe(false);
  });

  it('production-manager: view + edit + flag + manage members', () => {
    expect(canViewEvent(member, 'production-manager')).toBe(true);
    expect(canEditEvent(member, 'production-manager')).toBe(true);
    expect(canFlag(member, 'production-manager')).toBe(true);
    expect(canManageMembers(member, 'production-manager')).toBe(true);
  });

  it('membership management: PM or admin only', () => {
    expect(canManageMembers(member, null)).toBe(false);
    expect(canManageMembers(member, 'department-lead')).toBe(false);
    expect(canManageMembers(member, 'tech')).toBe(false);
  });
});

describe('permissions — department-scoped editing', () => {
  it('department-lead edits only their assigned departments', () => {
    const lead = { role: 'department-lead', departments: ['audio', 'staging'] } as const;
    expect(canEditDepartment(member, lead, 'audio')).toBe(true);
    expect(canEditDepartment(member, lead, 'staging')).toBe(true);
    expect(canEditDepartment(member, lead, 'lighting')).toBe(false);
  });

  it('department-lead with no assignments is read-only (the default)', () => {
    expect(canEditDepartment(member, { role: 'department-lead' }, 'audio')).toBe(false);
    expect(canEditDepartment(member, { role: 'department-lead', departments: [] }, 'audio')).toBe(
      false,
    );
  });

  it('tech never edits a department; PM edits all of them', () => {
    expect(canEditDepartment(member, { role: 'tech', departments: ['audio'] }, 'audio')).toBe(
      false,
    );
    expect(canEditDepartment(member, { role: 'production-manager' }, 'anything')).toBe(true);
  });
});

describe('permissions — multi-event scenario (the Phase 1 exit case)', () => {
  // A non-admin who is production-manager on event A and tech on event B:
  // resolve the role per event, then check capabilities.
  const roleByEvent: Record<string, 'production-manager' | 'tech'> = {
    'event-a': 'production-manager',
    'event-b': 'tech',
  };

  it('can edit event A but only read event B', () => {
    expect(canEditEvent(member, roleByEvent['event-a'])).toBe(true);
    expect(canViewEvent(member, roleByEvent['event-b'])).toBe(true);
    expect(canEditEvent(member, roleByEvent['event-b'])).toBe(false);
  });
});
