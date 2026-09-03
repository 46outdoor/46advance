/**
 * Narrow-screen navigation disclosure (planning/archive/feature/PWA_MOBILE_NAV_PLAN.md).
 *
 * Two things are proven here, both of which need real seeded claims rather than a mocked
 * viewer:
 *
 *  1. **The per-persona menu matrix.** Nav visibility is a presentation policy resolved from
 *     `src/lib/nav/items.ts` — `all`, `pm-or-oversight` (delegates to `canViewTracker`),
 *     `cross-event` (admin/organizer/production director) and `admin`. The pure matrix is
 *     unit-tested; what this file adds is that a real ID token plus a real
 *     `collectionGroup('members')` read land on the same answer.
 *  2. **The disclosure behaves like a disclosure** — open/close, outside click, Escape and
 *     focus return, route changes, and the inline breakpoint.
 *
 * ⚠ Hiding a link is NOT access control — the absence assertions below are about what the
 * chrome OFFERS, not what it protects. `/contacts` and `/documents` are separately protected
 * by a `CapabilityGate` route guard (covered by `directory-access.emulator.spec.ts`) and, since
 * 2026-09-03, by the `canBrowseGlobalDirectories` read rules in firestore.rules.
 * See planning/ACCESS_SCOPING_PLAN.md.
 *
 * DOM contract this file assumes (see AppShell + the plan's § Interaction & accessibility):
 *   - trigger: `<button type="button" aria-label="Main navigation" aria-expanded aria-controls="app-nav-menu">`
 *   - panel:   `<nav id="app-nav-menu" aria-label="Main navigation">` wrapping a `<ul>`
 *   - groups render in order: destinations, admin, account; the account group is
 *     Settings link → email as a non-interactive span → Sign out button
 *   - exactly one presentation is in the DOM at a time (chosen by `matchMedia`), so there is
 *     never a duplicate "Main navigation" landmark
 *   - the panel follows the trigger in DOM order, so Tab moves from trigger into the menu
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { openAs, signIn } from './fixtures';
import { PERSONAS, type Persona } from './personas';

/** Phone portrait — below the inline breakpoint (`INLINE_NAV_MIN_WIDTH`, 880). */
const NARROW = { width: 390, height: 844 };
/** Comfortably above the breakpoint; the exact boundary is covered in the
 * responsive spec, this is just "wide enough to be the inline presentation". */
const WIDE = { width: 1000, height: 800 };

/** The account rows every persona gets, in render order. Settings is a registry destination;
 * the email span is non-interactive so it never appears in a row list. */
const ACCOUNT_ROWS = ['/settings', 'button:Sign out'];

/**
 * How many seeded identities the Admin badge should be counting: a non-admin whose account is
 * not approved (`isPendingApproval`). Derived from the persona catalog rather than hardcoded
 * to 2, so adding a persona doesn't silently break this expectation.
 */
const PENDING_APPROVAL_COUNT = Object.values(PERSONAS).filter(
  (persona) => persona.claims.admin !== true && persona.claims.approved !== true,
).length;

const navTrigger = (page: Page): Locator => page.getByRole('button', { name: 'Main navigation' });
const navMenu = (page: Page): Locator => page.getByRole('navigation', { name: 'Main navigation' });

/**
 * The menu's interactive rows in DOM order, read in ONE shot.
 *
 * Links are keyed by pathname because that is the registry's actual contract (`NavItem.to`);
 * keying by label would make the Admin row's pending-count badge ("Admin2") perturb the
 * comparison, and comparing whole arrays is what catches an item that should be absent.
 */
async function navRowKeys(menu: Locator): Promise<string[]> {
  return menu.evaluate((root) =>
    Array.from(root.querySelectorAll('a, button')).map((el) =>
      el instanceof HTMLAnchorElement
        ? new URL(el.href, window.location.origin).pathname
        : `button:${(el.textContent ?? '').replace(/\s+/g, ' ').trim()}`,
    ),
  );
}

/**
 * Land on /events with the async nav gate settled.
 *
 * Tracker is gated on `useMyEventMemberships()`, and an UNRESOLVED query renders as hidden —
 * which means "Tracker is absent" is also exactly what a not-yet-loaded menu looks like. A
 * naive absence assertion would therefore pass even with the gate wired backwards. For a
 * non-oversight viewer the events list resolves from the same self-only
 * `collectionGroup('members')` read, so once its loading state has cleared the membership
 * answer is in hand and the menu's contents are final.
 */
async function gotoEventsSettled(page: Page): Promise<void> {
  await page.goto('/events');
  await expect(page.getByRole('heading', { name: 'Events', level: 1 })).toBeVisible();
  await expect(page.getByText(/Loading events/)).toHaveCount(0);
}

/** Open the disclosure, asserting the trigger's contract on the way through. */
async function openNavMenu(page: Page): Promise<Locator> {
  const trigger = navTrigger(page);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toHaveAttribute('aria-controls', 'app-nav-menu');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const menu = navMenu(page);
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('id', 'app-nav-menu');
  return menu;
}

/** Sign in at phone width, settle on /events, open the menu. */
async function openMenuAs(page: Page, persona: Persona): Promise<Locator> {
  await page.setViewportSize(NARROW);
  await signIn(page, persona);
  await gotoEventsSettled(page);
  return openNavMenu(page);
}

/** The email is identity, not an action: present, but never a link or a button. */
async function expectNonInteractiveEmail(
  menu: Locator,
  persona: Persona,
  rows: string[],
): Promise<void> {
  await expect(menu.getByText(persona.email, { exact: true }).last()).toBeVisible();
  expect(rows.filter((row) => row.includes(persona.email))).toEqual([]);
}

test.describe('narrow nav disclosure — per-persona contents', () => {
  test('a PM sees Events and Tracker, and neither cross-event directory', async ({ page }) => {
    // `pm` is production-manager on e2e-event-alpha with NO global claim — the case the old
    // version of the responsive spec got wrong by asserting Contacts/Documents were visible.
    const menu = await openMenuAs(page, PERSONAS.pm);
    const rows = await navRowKeys(menu);

    expect(rows).toEqual(['/events', '/tracker', ...ACCOUNT_ROWS]);
    await expectNonInteractiveEmail(menu, PERSONAS.pm, rows);
    // Spelled out as well as covered by the array compare — these are the policy's whole point.
    await expect(menu.locator('a[href="/contacts"]')).toHaveCount(0);
    await expect(menu.locator('a[href="/documents"]')).toHaveCount(0);
    await expect(menu.locator('a[href="/admin"]')).toHaveCount(0);
  });

  test('a lead and a tech see Events only — the Tracker gate must not fail open', async ({
    browser,
  }) => {
    // Three isolated contexts, one test: the PM proves this build CAN render Tracker, so the
    // lead's and tech's empty menus are a real denial rather than a link that never shipped.
    // That pairing is what catches the gate silently failing open (or silently failing shut).
    const pm = await openAs(browser, 'pm');
    const lead = await openAs(browser, 'lead');
    const tech = await openAs(browser, 'tech');
    try {
      for (const session of [pm, lead, tech]) {
        await session.page.setViewportSize(NARROW);
        await gotoEventsSettled(session.page);
      }
      const [pmRows, leadRows, techRows] = await Promise.all(
        [pm, lead, tech].map(async (session) => navRowKeys(await openNavMenu(session.page))),
      );

      expect(pmRows).toEqual(['/events', '/tracker', ...ACCOUNT_ROWS]);
      expect(leadRows).toEqual(['/events', ...ACCOUNT_ROWS]);
      expect(techRows).toEqual(['/events', ...ACCOUNT_ROWS]);
    } finally {
      await Promise.all([pm.context.close(), lead.context.close(), tech.context.close()]);
    }
  });

  test('an organizer sees the cross-event directories but no Tracker and no admin group', async ({
    page,
  }) => {
    // Global organizer, zero memberships: `cross-event` is satisfied, `pm-or-oversight` is not.
    // `organizer` is deliberately NOT a synonym for production manager.
    const menu = await openMenuAs(page, PERSONAS.organizer);
    const rows = await navRowKeys(menu);

    expect(rows).toEqual(['/events', '/contacts', '/documents', ...ACCOUNT_ROWS]);
    await expectNonInteractiveEmail(menu, PERSONAS.organizer, rows);
  });

  test('a production director sees Tracker and the directories without holding a membership', async ({
    page,
  }) => {
    // `director` appears in no SEED_MEMBERSHIPS row at all: Tracker here comes from oversight
    // (`canViewTracker` → `canOverseeAllEvents`), and Contacts/Documents from the 2026-08-10
    // decision that added production director to the `cross-event` rule.
    const menu = await openMenuAs(page, PERSONAS.director);
    const rows = await navRowKeys(menu);

    expect(rows).toEqual(['/events', '/tracker', '/contacts', '/documents', ...ACCOUNT_ROWS]);
    await expectNonInteractiveEmail(menu, PERSONAS.director, rows);
    await expect(menu.locator('a[href="/admin"]')).toHaveCount(0);
  });

  test('an admin sees every destination, including the narrow-only ones, plus the pending badge', async ({
    page,
  }) => {
    const menu = await openMenuAs(page, PERSONAS.admin);
    const rows = await navRowKeys(menu);

    expect(rows).toEqual([
      '/events',
      '/tracker',
      '/contacts',
      '/documents',
      '/admin',
      '/templates',
      '/schedule-templates',
      ...ACCOUNT_ROWS,
    ]);
    await expectNonInteractiveEmail(menu, PERSONAS.admin, rows);

    // The Admin entry keeps its standing nudge: label plus the count of accounts awaiting
    // approval (the seeded `pending` and `revoked` identities).
    const adminLink = menu.locator('a[href="/admin"]');
    await expect(adminLink).toContainText('Admin');
    expect(PENDING_APPROVAL_COUNT).toBeGreaterThan(0);
    await expect(adminLink).toContainText(String(PENDING_APPROVAL_COUNT));
  });
});

test.describe('narrow nav disclosure — behaviour', () => {
  test('opens and closes from the trigger, and exists only once in the DOM', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await signIn(page, PERSONAS.pm);
    await gotoEventsSettled(page);

    // Closed: `toBeHidden` is satisfied by "not rendered" as well as "rendered hidden", so it
    // holds whichever way the implementation unmounts the panel.
    await expect(navMenu(page)).toBeHidden();

    const menu = await openNavMenu(page);
    // Raw DOM count, not the role query: a second presentation left mounted-but-hidden would
    // still be a duplicate "Main navigation" landmark, and the role query would not see it.
    await expect(page.locator('nav[aria-label="Main navigation"]')).toHaveCount(1);

    await navTrigger(page).click();
    await expect(navTrigger(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();
  });

  test('an outside click closes it', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await signIn(page, PERSONAS.pm);
    await gotoEventsSettled(page);
    const menu = await openNavMenu(page);

    // The bottom-right corner sits inside the page container's horizontal padding, so this
    // cannot accidentally hit a card link — the URL assertion below proves the close was not
    // just a side effect of navigating somewhere.
    await page.mouse.click(NARROW.width - 4, NARROW.height - 4);

    await expect(menu).toBeHidden();
    await expect(navTrigger(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveURL(/\/events$/);
  });

  test('Escape closes it from inside the panel and returns focus to the trigger', async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await signIn(page, PERSONAS.pm);
    await gotoEventsSettled(page);
    const menu = await openNavMenu(page);

    // Escape must work "from anywhere while open", so press it with focus moved into the panel.
    await menu.locator('a[href="/events"]').focus();
    await page.keyboard.press('Escape');

    await expect(menu).toBeHidden();
    await expect(navTrigger(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(navTrigger(page)).toBeFocused();
  });

  test('opening keeps focus on the trigger and the next Tab reaches the first link', async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await signIn(page, PERSONAS.pm);
    await gotoEventsSettled(page);
    const menu = await openNavMenu(page);

    // A disclosure is not a dialog: no focus move on open, no trap. The natural next stop is
    // the first link, which requires the panel to follow the trigger in DOM order.
    await expect(navTrigger(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu.locator('a[href="/events"]')).toBeFocused();
  });

  test('navigating from the menu closes it', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await signIn(page, PERSONAS.pm);
    await gotoEventsSettled(page);
    const menu = await openNavMenu(page);

    await menu.locator('a[href="/settings"]').click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(menu).toBeHidden();
    await expect(navTrigger(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('a search-only location change closes it', async ({ page }) => {
    // AppShell persists across protected routes, so a location change that keeps the same
    // pathname is the easy one to miss. The admin tab bar pushes `?tab=…` with `replace:false`,
    // so going back is a genuine router location change with the pathname untouched.
    await page.setViewportSize(NARROW);
    await signIn(page, PERSONAS.admin);
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Event setup' }).click();
    await expect(page).toHaveURL(/\/admin\?tab=event-setup$/);

    const menu = await openNavMenu(page);
    await page.goBack();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(menu).toBeHidden();
    await expect(navTrigger(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('crossing the inline breakpoint clears the open state', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await signIn(page, PERSONAS.pm);
    await gotoEventsSettled(page);
    await openNavMenu(page);

    // Widen past the breakpoint: the inline row takes over and the trigger stops existing.
    await page.setViewportSize(WIDE);
    await expect(navTrigger(page)).toHaveCount(0);
    await expect(navMenu(page)).toBeVisible();
    await expect(page.locator('nav[aria-label="Main navigation"]')).toHaveCount(1);

    // Back to narrow: rotating a phone must not resurrect the panel that was open before.
    await page.setViewportSize(NARROW);
    await expect(navTrigger(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(navMenu(page)).toBeHidden();
  });
});

test.describe('narrow nav disclosure — current destination', () => {
  test('marks the current destination with aria-current="page"', async ({ page }) => {
    const menu = await openMenuAs(page, PERSONAS.pm);

    await expect(menu.locator('a[href="/events"]')).toHaveAttribute('aria-current', 'page');
    await expect(menu.locator('a[href="/settings"]')).not.toHaveAttribute('aria-current', 'page');
  });

  test('keeps the parent destination current on a descendant route', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await signIn(page, PERSONAS.pm);

    // The schedule route, deliberately — it is as much a descendant of `/events` as the detail
    // screen, so it exercises exactly the same `aria-current` behaviour, and it is the one that
    // reliably LOADS for a plain member. `/events/:eventId` renders "Failed to load this event."
    // for this same persona and the same doc id, while `/events/:eventId/schedule` renders
    // fine — a pre-existing defect, unrelated to navigation and not root-caused here (see
    // planning/IDEAS.md § Findings). Pointing this test at the broken screen would mean a nav
    // assertion that fails for reasons that have nothing to do with the nav.
    await page.goto('/events/e2e-event-alpha/schedule');
    await expect(page.getByRole('heading', { level: 1, name: /Schedule/ })).toBeVisible();

    // The point of the test: `/events` stays current on its descendant, which is NavLink's
    // `end={false}` behaviour and the reason the registry must not set `end`.
    const menu = await openNavMenu(page);
    await expect(menu.locator('a[href="/events"]')).toHaveAttribute('aria-current', 'page');
  });
});
