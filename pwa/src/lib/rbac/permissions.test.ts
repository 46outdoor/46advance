import { describe, it, expect } from 'vitest';
import {
  canCreateEvents,
  canEditDepartment,
  canEditEvent,
  canFlag,
  canManageContact,
  canManageMembers,
  canOverseeAllEvents,
  canViewChecklist,
  canViewTracker,
  canViewTrackerForEvent,
  isAdmin,
} from './permissions';
import type { ContactOwnership, Viewer } from './permissions';

const admin: Viewer = { uid: 'admin-1', isAdmin: true };
const member: Viewer = { uid: 'user-1', isAdmin: false };
const organizer: Viewer = { uid: 'organizer-1', isAdmin: false, isOrganizer: true };
const director: Viewer = { uid: 'director-1', isAdmin: false, isProductionDirector: true };

describe('permissions — event creation (global capability)', () => {
  it('admin and organizers may create events; plain members may not', () => {
    expect(canCreateEvents(admin)).toBe(true);
    expect(canCreateEvents(organizer)).toBe(true);
    expect(canCreateEvents(member)).toBe(false);
  });

  it('a production director may not create events — oversight is not authorship', () => {
    expect(canCreateEvents(director)).toBe(false);
  });
});

describe('permissions — global admin', () => {
  it('admin can do everything regardless of per-event role', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(canEditEvent(admin, null)).toBe(true);
    expect(canFlag(admin, null)).toBe(true);
    expect(canManageMembers(admin, null)).toBe(true);
    expect(canEditDepartment(admin, null, 'audio')).toBe(true);
  });
});

describe('permissions — global oversight (production director)', () => {
  it('admin and production directors oversee every event; nobody else does', () => {
    expect(canOverseeAllEvents(admin)).toBe(true);
    expect(canOverseeAllEvents(director)).toBe(true);
    expect(canOverseeAllEvents(member)).toBe(false);
    expect(canOverseeAllEvents(organizer)).toBe(false);
  });

  it('an absent or explicitly false claim grants nothing (fails closed)', () => {
    expect(canOverseeAllEvents({ uid: 'u', isAdmin: false })).toBe(false);
    expect(canOverseeAllEvents({ uid: 'u', isAdmin: false, isProductionDirector: false })).toBe(
      false,
    );
  });

  it('oversight is read-only: a director with no membership gets no write capability', () => {
    expect(canEditEvent(director, null)).toBe(false);
    expect(canFlag(director, null)).toBe(false);
    expect(canManageMembers(director, null)).toBe(false);
    expect(canEditDepartment(director, null, 'audio')).toBe(false);
  });

  it('combined capabilities are additive: director + PM edits only the event they run', () => {
    expect(canEditEvent(director, 'production-manager')).toBe(true);
    expect(canManageMembers(director, 'production-manager')).toBe(true);
    expect(canEditEvent(director, null)).toBe(false);
    expect(canManageMembers(director, null)).toBe(false);
  });

  it('a lower per-event role never downgrades the global read capability', () => {
    expect(canOverseeAllEvents(director)).toBe(true);
    expect(canViewTrackerForEvent(director, 'tech')).toBe(true);
    expect(canEditEvent(director, 'tech')).toBe(false);
  });
});

describe('permissions — tracker visibility (global)', () => {
  it('oversight sees the tracker without any membership', () => {
    expect(canViewTracker(admin, false)).toBe(true);
    expect(canViewTracker(director, false)).toBe(true);
  });

  it('a PM on at least one event sees the tracker', () => {
    expect(canViewTracker(member, true)).toBe(true);
  });

  it('organizer-only, leads and techs do not — organizer permits creation, not oversight', () => {
    expect(canViewTracker(organizer, false)).toBe(false);
    expect(canViewTracker(member, false)).toBe(false);
  });

  it('unknown membership (undefined) resolves hidden, so the link never flashes', () => {
    expect(canViewTracker(member, undefined)).toBe(false);
    expect(canViewTracker(organizer, undefined)).toBe(false);
  });

  it('oversight does not wait on the membership query to resolve', () => {
    expect(canViewTracker(admin, undefined)).toBe(true);
    expect(canViewTracker(director, undefined)).toBe(true);
  });
});

describe('permissions — tracker visibility (per event)', () => {
  it('oversight opens any event tracker, member or not', () => {
    expect(canViewTrackerForEvent(admin, null)).toBe(true);
    expect(canViewTrackerForEvent(director, null)).toBe(true);
  });

  it('a PM opens only the events they run', () => {
    expect(canViewTrackerForEvent(member, 'production-manager')).toBe(true);
    expect(canViewTrackerForEvent(member, 'department-lead')).toBe(false);
    expect(canViewTrackerForEvent(member, 'tech')).toBe(false);
    expect(canViewTrackerForEvent(member, null)).toBe(false);
  });
});

describe('permissions — checklist visibility', () => {
  it('oversight reads the checklist without a membership row', () => {
    expect(canViewChecklist(admin, null)).toBe(true);
    expect(canViewChecklist(director, null)).toBe(true);
  });

  it('stays PM-only for ordinary members — leads and techs never see it', () => {
    expect(canViewChecklist(member, 'production-manager')).toBe(true);
    expect(canViewChecklist(member, 'department-lead')).toBe(false);
    expect(canViewChecklist(member, 'tech')).toBe(false);
    expect(canViewChecklist(member, null)).toBe(false);
  });

  it('mirrors the rules: viewing is widened, editing is not', () => {
    // A director may READ the checklist on an event they don't belong to, but the write
    // predicate must still refuse — that split is the whole capability boundary.
    expect(canViewChecklist(director, null)).toBe(true);
    expect(canEditEvent(director, null)).toBe(false);
  });
});

describe('permissions — per-event capability matrix (non-admin)', () => {
  it('non-member: no access', () => {
    expect(canEditEvent(member, null)).toBe(false);
    expect(canFlag(member, null)).toBe(false);
    expect(canManageMembers(member, null)).toBe(false);
    expect(canEditDepartment(member, null, 'audio')).toBe(false);
  });

  it('tech: read-only — no edit, no flag', () => {
    expect(canEditEvent(member, 'tech')).toBe(false);
    expect(canFlag(member, 'tech')).toBe(false);
  });

  it('department-lead: may flag, but no whole-event edit', () => {
    expect(canFlag(member, 'department-lead')).toBe(true);
    expect(canEditEvent(member, 'department-lead')).toBe(false);
  });

  it('production-manager: edit + flag + manage members', () => {
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

describe('permissions — contacts directory curation', () => {
  const ownContact: ContactOwnership = { createdBy: member.uid };
  const someoneElsesContact: ContactOwnership = { createdBy: 'author-9' };

  it('admin curates the whole directory', () => {
    expect(canManageContact(admin, ownContact)).toBe(true);
    expect(canManageContact(admin, someoneElsesContact)).toBe(true);
  });

  it('a production director curates the whole directory too', () => {
    // The claim's ONE write. Directory curation is not event authority — the event write
    // predicates above still refuse a director with no membership.
    expect(canManageContact(director, ownContact)).toBe(true);
    expect(canManageContact(director, someoneElsesContact)).toBe(true);
  });

  it('an approved user manages the entries they created', () => {
    expect(canManageContact(member, ownContact)).toBe(true);
  });

  it("an approved user may not touch someone else's entry", () => {
    expect(canManageContact(member, someoneElsesContact)).toBe(false);
  });

  it('an organizer is not a curator — creating events is not directory stewardship', () => {
    expect(canManageContact(organizer, someoneElsesContact)).toBe(false);
    expect(canManageContact(organizer, { createdBy: organizer.uid })).toBe(true);
  });

  it('an absent or explicitly false director claim grants nothing (fails closed)', () => {
    const absent: Viewer = { uid: 'u', isAdmin: false };
    const explicitlyFalse: Viewer = { uid: 'u', isAdmin: false, isProductionDirector: false };
    expect(canManageContact(absent, someoneElsesContact)).toBe(false);
    expect(canManageContact(explicitlyFalse, someoneElsesContact)).toBe(false);
  });
});

describe('permissions — multi-event scenario (the Phase 1 exit case)', () => {
  // A non-admin who is production-manager on event A and tech on event B:
  // resolve the role per event, then check capabilities. Read access to event B is no longer
  // asserted here — the dead `canViewEvent` predicate was removed, and observable event reads
  // come from firestore.rules plus `getEventBySlugOrId` returning null on denial.
  const roleByEvent: Record<string, 'production-manager' | 'tech'> = {
    'event-a': 'production-manager',
    'event-b': 'tech',
  };

  it('can edit event A but only read event B', () => {
    expect(canEditEvent(member, roleByEvent['event-a'])).toBe(true);
    expect(canEditEvent(member, roleByEvent['event-b'])).toBe(false);
  });
});
