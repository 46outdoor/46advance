/**
 * Admin tab registry (planning/ADMIN_NAVIGATION.md). Lives in `lib/` rather than
 * `features/admin/` because the deep-link call sites in OTHER features (the event form's
 * "add festivals first", the documents screen's "set the library folder", the template
 * editor's "create schedule templates") must link to a tab, and a feature may never import
 * from another feature (`no-cross-feature`).
 *
 * The active tab rides a `?tab=` search param — linkable and back-button-friendly, with
 * deliberately no per-user memory (decision 2026-07-31: predictable beats personalised).
 */

export const ADMIN_TABS = [
  { id: 'people', label: 'People & access' },
  { id: 'event-setup', label: 'Event setup' },
  { id: 'documents', label: 'Documents' },
  { id: 'branding', label: 'Branding & output' },
] as const;

export type AdminTabId = (typeof ADMIN_TABS)[number]['id'];

export const DEFAULT_ADMIN_TAB: AdminTabId = 'people';

/** Resolve a raw `?tab=` value; anything unknown lands on the default rather than a blank page. */
export function parseAdminTab(raw: string | null): AdminTabId {
  return (ADMIN_TABS.find((t) => t.id === raw)?.id ?? DEFAULT_ADMIN_TAB) as AdminTabId;
}

/** Deep-link path to one admin tab, e.g. `/admin?tab=event-setup`. */
export function adminTabPath(id: AdminTabId): string {
  return `/admin?tab=${id}`;
}
