import { describe, it, expect } from 'vitest';
import {
  INLINE_NAV_MEDIA_QUERY,
  INLINE_NAV_MIN_WIDTH,
  NAV_ITEMS,
  resolveNavVisibility,
  visibleNavGroup,
  visibleNavItems,
} from './items';
import type { NavItem, NavPlacement } from './items';
import type { Viewer } from '@/lib/rbac/permissions';

const admin: Viewer = { uid: 'admin-1', isAdmin: true };
const organizer: Viewer = { uid: 'organizer-1', isAdmin: false, isOrganizer: true };
const director: Viewer = { uid: 'director-1', isAdmin: false, isProductionDirector: true };
/** A plain approved user. `pm` and `tech` differ only in the `isPmSomewhere` argument. */
const pm: Viewer = { uid: 'pm-1', isAdmin: false };
const tech: Viewer = { uid: 'tech-1', isAdmin: false };

const labels = (items: readonly NavItem[]): string[] => items.map((item) => item.label);
const ids = (items: readonly NavItem[]): string[] => items.map((item) => item.id);

describe('nav visibility — "all"', () => {
  it('shows every signed-in user, whatever their claims or membership state', () => {
    expect(resolveNavVisibility('all', admin, false)).toBe(true);
    expect(resolveNavVisibility('all', organizer, false)).toBe(true);
    expect(resolveNavVisibility('all', director, false)).toBe(true);
    expect(resolveNavVisibility('all', pm, true)).toBe(true);
    expect(resolveNavVisibility('all', tech, false)).toBe(true);
  });

  it('does not wait on the membership query', () => {
    expect(resolveNavVisibility('all', tech, undefined)).toBe(true);
  });
});

describe('nav visibility — "admin"', () => {
  it('is admin-only; no other global claim reaches it', () => {
    expect(resolveNavVisibility('admin', admin, false)).toBe(true);
    expect(resolveNavVisibility('admin', organizer, false)).toBe(false);
    expect(resolveNavVisibility('admin', director, false)).toBe(false);
    expect(resolveNavVisibility('admin', pm, true)).toBe(false);
    expect(resolveNavVisibility('admin', tech, false)).toBe(false);
  });

  it('ignores the membership query entirely — a PM claim never confers admin', () => {
    expect(resolveNavVisibility('admin', tech, undefined)).toBe(false);
    expect(resolveNavVisibility('admin', pm, true)).toBe(false);
    expect(resolveNavVisibility('admin', admin, undefined)).toBe(true);
  });
});

describe('nav visibility — "cross-event"', () => {
  it('admin, organizer, and production director all reach the cross-event directories', () => {
    expect(resolveNavVisibility('cross-event', admin, false)).toBe(true);
    expect(resolveNavVisibility('cross-event', organizer, false)).toBe(true);
    expect(resolveNavVisibility('cross-event', director, false)).toBe(true);
  });

  it('a plain user does not', () => {
    expect(resolveNavVisibility('cross-event', tech, false)).toBe(false);
  });

  it('a PM-who-is-only-a-PM does not — running a show is not cross-event scope', () => {
    expect(resolveNavVisibility('cross-event', pm, true)).toBe(false);
  });

  it('is decided by claims alone, so the membership query never gates it', () => {
    expect(resolveNavVisibility('cross-event', director, undefined)).toBe(true);
    expect(resolveNavVisibility('cross-event', organizer, undefined)).toBe(true);
    expect(resolveNavVisibility('cross-event', tech, undefined)).toBe(false);
  });

  it('an absent claim behaves as false (fails closed)', () => {
    expect(resolveNavVisibility('cross-event', { uid: 'u', isAdmin: false }, false)).toBe(false);
    expect(
      resolveNavVisibility(
        'cross-event',
        { uid: 'u', isAdmin: false, isOrganizer: false, isProductionDirector: false },
        false,
      ),
    ).toBe(false);
  });
});

describe('nav visibility — "pm-or-oversight" (tri-state)', () => {
  it('oversight sees it with no membership at all', () => {
    expect(resolveNavVisibility('pm-or-oversight', admin, false)).toBe(true);
    expect(resolveNavVisibility('pm-or-oversight', director, false)).toBe(true);
  });

  it('a PM on at least one event sees it', () => {
    expect(resolveNavVisibility('pm-or-oversight', pm, true)).toBe(true);
  });

  it('an organizer and a plain user do not', () => {
    expect(resolveNavVisibility('pm-or-oversight', organizer, false)).toBe(false);
    expect(resolveNavVisibility('pm-or-oversight', tech, false)).toBe(false);
  });

  it('UNKNOWN membership resolves HIDDEN for a plain user — the anti-flash policy', () => {
    // The single most important assertion in this file. `undefined` means the async
    // membership query has not settled; rendering the link now means it appears and then
    // vanishes. Hidden-until-known is the contract.
    expect(resolveNavVisibility('pm-or-oversight', tech, undefined)).toBe(false);
    expect(resolveNavVisibility('pm-or-oversight', organizer, undefined)).toBe(false);
  });

  it('unknown membership still resolves VISIBLE for oversight — their access is synchronous', () => {
    expect(resolveNavVisibility('pm-or-oversight', admin, undefined)).toBe(true);
    expect(resolveNavVisibility('pm-or-oversight', director, undefined)).toBe(true);
  });
});

describe('visibleNavItems — placements', () => {
  it('never surfaces the narrow-only destinations inline, even for an admin', () => {
    const inline = ids(visibleNavItems('inline', admin, true));
    expect(inline).not.toContain('tracker');
    expect(inline).not.toContain('templates');
    expect(inline).not.toContain('schedule-templates');
  });

  it('surfaces them in the narrow disclosure', () => {
    const narrow = ids(visibleNavItems('narrow', admin, true));
    expect(narrow).toContain('tracker');
    expect(narrow).toContain('templates');
    expect(narrow).toContain('schedule-templates');
  });

  it('keeps the narrow menu a superset of the inline row — nothing is inline-only', () => {
    const narrow = ids(visibleNavItems('narrow', admin, true));
    for (const id of ids(visibleNavItems('inline', admin, true))) {
      expect(narrow).toContain(id);
    }
  });

  it('returns items in registry order', () => {
    const order = ids(NAV_ITEMS);
    const narrow = ids(visibleNavItems('narrow', admin, true));
    expect(narrow).toEqual(order.filter((id) => narrow.includes(id)));
  });

  it('only ever returns items that declare the requested placement', () => {
    const placements: readonly NavPlacement[] = ['narrow', 'inline'];
    for (const placement of placements) {
      for (const item of visibleNavItems(placement, admin, true)) {
        expect(item.placements).toContain(placement);
      }
    }
  });
});

describe('visibleNavItems — per-persona menus (narrow)', () => {
  it('a plain tech gets Events and Settings only', () => {
    expect(labels(visibleNavItems('narrow', tech, false))).toEqual(['Events', 'Settings']);
  });

  it('a plain tech gets the same menu while the membership query is unresolved', () => {
    expect(labels(visibleNavItems('narrow', tech, undefined))).toEqual(['Events', 'Settings']);
  });

  it('a PM adds Tracker and nothing else', () => {
    expect(labels(visibleNavItems('narrow', pm, true))).toEqual(['Events', 'Tracker', 'Settings']);
  });

  it('an organizer gets the cross-event directories but not Tracker', () => {
    expect(labels(visibleNavItems('narrow', organizer, false))).toEqual([
      'Events',
      'Contacts',
      'Documents',
      'Settings',
    ]);
  });

  it('a production director gets Tracker AND the cross-event directories', () => {
    expect(labels(visibleNavItems('narrow', director, false))).toEqual([
      'Events',
      'Tracker',
      'Contacts',
      'Documents',
      'Settings',
    ]);
  });

  it('an admin gets every registry item', () => {
    expect(labels(visibleNavItems('narrow', admin, false))).toEqual([
      'Events',
      'Tracker',
      'Contacts',
      'Documents',
      'Admin',
      'Templates',
      'Schedule templates',
      'Settings',
    ]);
  });
});

describe('visibleNavItems — per-persona menus (inline)', () => {
  it('a plain tech gets Events and Settings only', () => {
    expect(labels(visibleNavItems('inline', tech, false))).toEqual(['Events', 'Settings']);
  });

  it('a PM gets no Tracker inline — it is narrow-only regardless of permission', () => {
    expect(labels(visibleNavItems('inline', pm, true))).toEqual(['Events', 'Settings']);
  });

  it('an organizer gets the cross-event directories', () => {
    expect(labels(visibleNavItems('inline', organizer, false))).toEqual([
      'Events',
      'Contacts',
      'Documents',
      'Settings',
    ]);
  });

  it('a production director reaches Contacts inline (the 2026-08-10 decision)', () => {
    expect(labels(visibleNavItems('inline', director, false))).toEqual([
      'Events',
      'Contacts',
      'Documents',
      'Settings',
    ]);
  });

  it('an admin gets the full inline row, minus the narrow-only items', () => {
    expect(labels(visibleNavItems('inline', admin, false))).toEqual([
      'Events',
      'Contacts',
      'Documents',
      'Admin',
      'Settings',
    ]);
  });
});

describe('visibleNavGroup', () => {
  it('returns only the requested group', () => {
    expect(labels(visibleNavGroup('destinations', 'narrow', admin, true))).toEqual([
      'Events',
      'Tracker',
      'Contacts',
      'Documents',
    ]);
    expect(labels(visibleNavGroup('admin', 'narrow', admin, true))).toEqual([
      'Admin',
      'Templates',
      'Schedule templates',
    ]);
    expect(labels(visibleNavGroup('account', 'narrow', admin, true))).toEqual(['Settings']);
  });

  it('every returned item belongs to that group', () => {
    for (const item of visibleNavGroup('destinations', 'narrow', admin, true)) {
      expect(item.group).toBe('destinations');
    }
  });

  it('applies the same visibility gates as visibleNavItems', () => {
    expect(visibleNavGroup('admin', 'narrow', director, false)).toEqual([]);
    expect(labels(visibleNavGroup('destinations', 'narrow', tech, undefined))).toEqual(['Events']);
    expect(labels(visibleNavGroup('account', 'narrow', tech, false))).toEqual(['Settings']);
  });

  it('partitions the menu — the groups together reproduce visibleNavItems', () => {
    const grouped = [
      ...visibleNavGroup('destinations', 'narrow', admin, true),
      ...visibleNavGroup('admin', 'narrow', admin, true),
      ...visibleNavGroup('account', 'narrow', admin, true),
    ];
    expect(ids(grouped)).toEqual(ids(visibleNavItems('narrow', admin, true)));
  });
});

describe('NAV_ITEMS registry', () => {
  it('has unique ids — runtime decoration keys off them', () => {
    expect(new Set(ids(NAV_ITEMS)).size).toBe(NAV_ITEMS.length);
  });

  it('gives every item at least one placement', () => {
    for (const item of NAV_ITEMS) {
      expect(item.placements.length).toBeGreaterThan(0);
    }
  });

  it('derives the media query from the breakpoint constant, so they cannot drift', () => {
    expect(INLINE_NAV_MIN_WIDTH).toBe(800);
    expect(INLINE_NAV_MEDIA_QUERY).toBe(`(min-width: ${INLINE_NAV_MIN_WIDTH}px)`);
  });
});
