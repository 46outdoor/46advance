/**
 * Scoped access to the cross-event directories (planning/ACCESS_SCOPING_PLAN.md).
 *
 * Two halves of the same decision, and the second is what makes the first survivable:
 *
 *  1. **The directories are for global capabilities.** `/contacts` and `/documents` used to be
 *     reachable by URL for any approved user — the nav hid the links, which protects nothing.
 *     A `CapabilityGate` now redirects anyone without `canBrowseGlobalDirectories`.
 *  2. **Crew still see their own show's people.** The roster renders from display fields
 *     denormalized onto each attachment, so a tech reads ONE member-gated subcollection and
 *     never the global directory. Before this change the Crew panel resolved names by listing
 *     the whole directory, which is precisely what a tech is about to lose.
 *
 * Half 2 is the regression risk of the whole plan: if it breaks, every crew member's roster
 * goes blank the moment the rules land. It is asserted here against a real emulator, signed in
 * as a real tech.
 *
 * ⚠ These tests describe the CLIENT's behaviour — the redirect and the roster render. The
 * ENFORCEMENT is `firestore.rules` (narrowed 2026-09-03), covered by
 * `test/firestore.rules.test.ts`. Both matter: the rules stop the read, and these stop a user
 * being dropped on a screen that can only fail.
 */
import { test, expect, type Page } from '@playwright/test';
import { openAs } from './fixtures';
import { PERSONAS, type PersonaKey } from './personas';

/** The app's current path. Never `waitForLoadState('networkidle')` here — Firestore holds a
 *  streaming connection open, so the network never goes idle and the wait just burns 30s. */
const pathOf = (page: Page): string => new URL(page.url()).pathname;

/** Assert a route redirects. `expect.poll` covers the gap while claims resolve — the gate
 *  renders nothing until it knows, so the redirect lands a tick after navigation. */
async function expectRedirect(page: Page, from: string, to = '/events'): Promise<void> {
  await page.goto(from);
  await expect.poll(() => pathOf(page), { message: `${from} should redirect` }).toBe(to);
}

/** Assert a route renders. The heading matters as much as the URL: staying put proves nothing
 *  if the screen behind the gate never mounted. */
async function expectRenders(page: Page, route: string, heading: string): Promise<void> {
  await page.goto(route);
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  expect(pathOf(page)).toBe(route);
}

const DIRECTORY_ROUTES = [
  { path: '/contacts', heading: 'Contacts' },
  { path: '/documents', heading: 'Documents' },
] as const;

test.describe('cross-event directory route guards', () => {
  for (const key of ['tech', 'pm', 'lead'] as const satisfies readonly PersonaKey[]) {
    test(`redirects ${key} away from the directories`, async ({ browser }) => {
      const { context, page } = await openAs(browser, key);
      try {
        for (const { path } of DIRECTORY_ROUTES) {
          await expectRedirect(page, path);
        }
        // The per-artist library screen is the same surface reached a level deeper.
        await expectRedirect(page, '/documents/artists/band');
      } finally {
        await context.close();
      }
    });
  }

  for (const key of [
    'admin',
    'organizer',
    'director',
    'coordinator',
  ] as const satisfies readonly PersonaKey[]) {
    test(`admits ${key} to the directories`, async ({ browser }) => {
      const { context, page } = await openAs(browser, key);
      try {
        for (const { path, heading } of DIRECTORY_ROUTES) {
          await expectRenders(page, path, heading);
        }
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('crew roster without directory access', () => {
  test('a tech sees their own show’s crew, names and all', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'tech');
    try {
      await page.goto('/events/e2e-event-alpha');
      // Scoped to the roster region: crew names also appear in the Travel & Lodging panel's
      // per-person grouping, so an unscoped match is ambiguous.
      const crew = page.getByRole('region', { name: 'Crew' });
      await expect(crew).toBeVisible();

      // Both seeded crew members resolve from the copies on the attachments. The tech has no
      // business reading the global directory to learn these names — and after the rules
      // change, no ability to.
      await expect(crew.getByText(PERSONAS.tech.displayName)).toBeVisible();
      await expect(crew.getByText('Norma Nolink')).toBeVisible();
      await expect(crew.getByText('Audio Tech')).toBeVisible();
      // Nothing offers a tech the directory: not the nav, not the panel's own shortcut.
      await expect(page.locator('a[href="/contacts"]')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('a roster editor who also holds a browsing capability keeps the add-crew picker', async ({
    browser,
  }) => {
    // The coordinator is the case the plan is built around: curates crew across every show AND
    // browses the directory, with no membership anywhere. Decision 1 accepts that a PM who
    // needs the picker holds a global claim in the same way.
    const { context, page } = await openAs(browser, 'coordinator');
    try {
      await page.goto('/events/e2e-event-alpha');
      const crew = page.getByRole('region', { name: 'Crew' });
      await expect(crew.getByText('Add crew member')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('a PM without a browsing capability is told why they cannot add crew', async ({
    browser,
  }) => {
    // Roster-edit rights and directory access have come apart. The panel must say so rather
    // than render a picker whose query the rules will refuse.
    const { context, page } = await openAs(browser, 'pm');
    try {
      await page.goto('/events/e2e-event-alpha');
      const crew = page.getByRole('region', { name: 'Crew' });
      await expect(
        crew.getByText(/Adding crew needs access to the contacts directory/),
      ).toBeVisible();
      await expect(crew.getByText('Add crew member')).toHaveCount(0);
      // Still a curator of the crew already on the show.
      await expect(crew.getByText('Norma Nolink')).toBeVisible();
      await expect(crew.getByRole('button', { name: 'Remove' }).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
