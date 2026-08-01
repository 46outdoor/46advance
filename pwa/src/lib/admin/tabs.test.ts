import { describe, it, expect } from 'vitest';
import { ADMIN_TABS, DEFAULT_ADMIN_TAB, adminTabPath, parseAdminTab } from './tabs';

describe('admin tabs registry', () => {
  it('resolves every registered id to itself', () => {
    for (const t of ADMIN_TABS) expect(parseAdminTab(t.id)).toBe(t.id);
  });

  // Unknown values land on the default rather than a blank page: `?tab=` is a public URL surface,
  // so stale bookmarks and typos must degrade to something usable.
  it.each([[null], [''], ['nonsense'], ['People & access']])(
    'falls back to the default for %j',
    (raw) => {
      expect(parseAdminTab(raw)).toBe(DEFAULT_ADMIN_TAB);
    },
  );

  it('builds the deep-link path the in-app instructions use', () => {
    expect(adminTabPath('event-setup')).toBe('/admin?tab=event-setup');
    expect(adminTabPath(DEFAULT_ADMIN_TAB)).toBe('/admin?tab=people');
  });

  it('ids are unique and stable (they are public URLs — renaming one breaks bookmarks)', () => {
    const ids = ADMIN_TABS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['people', 'event-setup', 'documents', 'branding']);
  });
});
