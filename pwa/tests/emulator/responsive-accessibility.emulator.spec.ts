/**
 * WS-L: the authenticated app chrome at real viewport sizes.
 *
 * The nav rework (planning/PWA_MOBILE_NAV_PLAN.md) INVERTED what this file used to assert.
 * It previously signed in as `pm` at 390×844 and required Contacts and Documents to be
 * visible; those are now `cross-event` destinations (admin, organizer or production director),
 * so a plain production manager must not be offered them at any width. What survives unchanged
 * is the document-level `scrollWidth <= clientWidth` guard — still the cheapest possible proof
 * that nothing in the chrome blows the layout out sideways on a phone.
 *
 * Division of labour: the disclosure's behaviour and the per-persona menu matrix live in
 * `nav-disclosure.emulator.spec.ts`. This file owns the things that only a real browser at a
 * real size can answer — overflow, the presentation boundary, wrapping, touch-target
 * geometry, a short landscape viewport, and axe.
 *
 * The DOM contract these tests assume is documented at the top of `nav-disclosure.emulator.spec.ts`.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { signIn, signOut } from './fixtures';
import { PERSONAS, type Persona } from './personas';

const NARROW = { width: 390, height: 844 };
/**
 * Must track `INLINE_NAV_MIN_WIDTH` in `src/lib/nav/items.ts`. Not imported: that module
 * resolves `@/` aliases the Playwright transform does not configure, so the value is mirrored
 * here and the boundary tests below fail loudly if the two ever drift apart.
 */
const INLINE_MIN = 880;
/** One pixel below the breakpoint — still the disclosure. */
const JUST_BELOW_INLINE = { width: INLINE_MIN - 1, height: 900 };
/** Exactly the breakpoint: the first width that must render the inline row, and therefore the
 * real worst case for wrapping. */
const AT_INLINE = { width: INLINE_MIN, height: 900 };
/** Phone in landscape: an admin menu is ~10 rows of 44px and cannot fit in 360px of height. */
const SHORT_LANDSCAPE = { width: 740, height: 360 };

/** Project rule: 44px minimum touch target. Half a pixel of slack absorbs sub-pixel layout
 * rounding — `min-h-11` is exactly 44px, so anything materially smaller is a real miss. */
const MIN_TOUCH_TARGET = 43.5;

const navTrigger = (page: Page): Locator => page.getByRole('button', { name: 'Main navigation' });
const navMenu = (page: Page): Locator => page.getByRole('navigation', { name: 'Main navigation' });

/**
 * axe-core's BROWSER bundle, injected into the page — the repo's existing a11y coverage uses
 * `jest-axe`, which is a jsdom matcher and cannot be pointed at a Playwright page. No new
 * dependency is added here: `jest-axe` (a devDependency) ships the 4.x engine in its own
 * `node_modules`, and `@types/jest-axe` drags an older copy to the top level. Prefer the
 * former, fall back to the latter, and skip the check outright if neither is on disk rather
 * than making the emulator lane depend on a package this workspace never declared.
 */
const AXE_BUNDLE = [
  '../../node_modules/jest-axe/node_modules/axe-core/axe.min.js',
  '../../node_modules/axe-core/axe.min.js',
]
  .map((relative) => fileURLToPath(new URL(relative, import.meta.url)))
  .find((candidate) => existsSync(candidate));

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[] }[];
}

declare global {
  interface Window {
    axe: {
      run: (context?: unknown, options?: unknown) => Promise<{ violations: AxeViolation[] }>;
    };
  }
}

/** See `nav-disclosure.emulator.spec.ts` — the Tracker entry is gated on an async membership
 * summary, so the menu's contents are not final until the events list has stopped loading.
 * Duplicated rather than shared: importing from another spec file would re-register its tests. */
async function gotoEventsSettled(page: Page): Promise<void> {
  await page.goto('/events');
  await expect(page.getByRole('heading', { name: 'Events', level: 1 })).toBeVisible();
  await expect(page.getByText(/Loading events/)).toHaveCount(0);
}

async function openNavMenu(page: Page): Promise<Locator> {
  const trigger = navTrigger(page);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const menu = navMenu(page);
  await expect(menu).toBeVisible();
  return menu;
}

/** The classic guard: nothing in the chrome may make the document scroll sideways. */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

/** The innermost element whose text is exactly the persona's address — the identity span.
 * Nested matches come out in document order, so the last one is the deepest. */
const emailRow = (menu: Locator, persona: Persona): Locator =>
  menu.getByText(persona.email, { exact: true }).last();

test.describe('authenticated responsive shell', () => {
  test('a PM at phone width gets their destinations and no horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await signIn(page, PERSONAS.pm);
    await gotoEventsSettled(page);

    // Collapsed chrome: brand + trigger, and the page itself still renders its content.
    await expect(navTrigger(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alpha Festival' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const menu = await openNavMenu(page);
    await expect(menu.getByRole('link', { name: 'Events' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Tracker' })).toBeVisible();
    // Inverted from the pre-rework expectation: `pm` holds no global claim, so the
    // cross-event directories are not offered to them (see the plan's role table).
    await expect(menu.locator('a[href="/contacts"]')).toHaveCount(0);
    await expect(menu.locator('a[href="/documents"]')).toHaveCount(0);

    // The open panel is an overlay over the page, so the guard must hold in both states.
    await expectNoHorizontalOverflow(page);
  });

  test('one pixel below the breakpoint uses the disclosure; at it, the inline row is one line', async ({
    page,
  }) => {
    // Admin is the worst case: the most inline items, plus the pending-count badge.
    await page.setViewportSize(JUST_BELOW_INLINE);
    await signIn(page, PERSONAS.admin);
    await gotoEventsSettled(page);

    await expect(navTrigger(page)).toBeVisible();
    await expect(navMenu(page)).toBeHidden();

    await page.setViewportSize(AT_INLINE);
    await expect(navTrigger(page)).toHaveCount(0);
    const menu = navMenu(page);
    await expect(menu).toBeVisible();
    await expect(page.locator('nav[aria-label="Main navigation"]')).toHaveCount(1);

    // Narrow-only destinations never appear inline, at any width.
    await expect(menu.locator('a[href="/tracker"]')).toHaveCount(0);
    await expect(menu.locator('a[href="/templates"]')).toHaveCount(0);
    await expect(menu.locator('a[href="/schedule-templates"]')).toHaveCount(0);
    await expect(menu.locator('a[href="/events"]')).toBeVisible();
    await expect(menu.locator('a[href="/admin"]')).toBeVisible();

    expectOnOneLine(await rowCentres(menu, PERSONAS.admin), `admin inline row at ${INLINE_MIN}px`);
    await expectNoHorizontalOverflow(page);
  });

  test('a long address stays constrained in both presentations', async ({ page }) => {
    // No seeded persona has a long address, so the rendered identity text is replaced in place
    // and measured immediately. Nothing re-renders in between, and the assertion is behavioural
    // (the layout must absorb it) rather than a check for a particular Tailwind class.
    const long = 'production.director.of.everything@an-unusually-long-domain-name.example.com';

    await page.setViewportSize(AT_INLINE);
    await signIn(page, PERSONAS.admin);
    await gotoEventsSettled(page);

    const inlineEmail = emailRow(navMenu(page), PERSONAS.admin);
    await expect(inlineEmail).toBeVisible();
    await inlineEmail.evaluate((el, text) => {
      el.textContent = text;
    }, long);
    await expectNoHorizontalOverflow(page);
    // Constrained means the identity is truncated, not that the row grows a second line.
    expectOnOneLine(await rowCentres(navMenu(page), null), 'inline row with a long address');

    await page.setViewportSize(NARROW);
    const menu = await openNavMenu(page);
    const narrowEmail = emailRow(menu, PERSONAS.admin);
    await narrowEmail.evaluate((el, text) => {
      el.textContent = text;
    }, long);

    await expectNoHorizontalOverflow(page);
    const panel = await menu.boundingBox();
    if (!panel) throw new Error('the open nav panel has no bounding box');
    expect(panel.width).toBeLessThanOrEqual(NARROW.width);
  });

  test('the trigger, the brand link and every menu row meet the 44px touch target', async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await signIn(page, PERSONAS.admin);
    await gotoEventsSettled(page);

    const trigger = await navTrigger(page).boundingBox();
    if (!trigger) throw new Error('the nav trigger has no bounding box');
    expect(trigger.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(trigger.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

    // The brand mark shrinks to 32px in the collapsed header, so the LINK needs its own guard.
    const brand = await page.getByRole('link', { name: /46 Advance/ }).boundingBox();
    if (!brand) throw new Error('the brand home link has no bounding box');
    expect(brand.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

    // Measured on the interactive element itself, not on its <li>: padding the row while the
    // anchor inside it stays 18px tall is the exact miss this is looking for.
    const menu = await openNavMenu(page);
    const rows = await menu.evaluate((root) =>
      Array.from(root.querySelectorAll('a, button')).map((el) => ({
        label: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        height: el.getBoundingClientRect().height,
      })),
    );
    expect(rows.length).toBeGreaterThan(0);
    const undersized = rows.filter((row) => row.height < MIN_TOUCH_TARGET);
    expect(undersized, `rows below 44px: ${JSON.stringify(undersized)}`).toEqual([]);
  });

  test('the open menu scrolls so Sign out stays reachable on a short landscape viewport', async ({
    page,
  }) => {
    await page.setViewportSize(SHORT_LANDSCAPE);
    await signIn(page, PERSONAS.admin);
    await gotoEventsSettled(page);
    const menu = await openNavMenu(page);

    // The panel must be capped to the viewport rather than running off the bottom of it…
    const panel = await menu.boundingBox();
    if (!panel) throw new Error('the open nav panel has no bounding box');
    expect(panel.y + panel.height).toBeLessThanOrEqual(SHORT_LANDSCAPE.height + 1);

    // …and the overflow must be handled by a scroll container inside the panel, not by
    // scrolling the oversized sticky header. Checked on the panel or any descendant, since
    // the scroll container may be the <nav> itself or a wrapper it holds.
    const hasScrollContainer = await menu.evaluate((root) =>
      [root, ...Array.from(root.querySelectorAll('*'))].some((el) => {
        const overflowY = getComputedStyle(el).overflowY;
        return (
          (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1
        );
      }),
    );
    expect(hasScrollContainer).toBe(true);

    const signOutButton = menu.getByRole('button', { name: /sign out/i });
    await signOutButton.scrollIntoViewIfNeeded();
    await expect(signOutButton).toBeInViewport({ ratio: 1 });
    // Reachable is not the same as usable — actually use it.
    await signOut(page);
  });

  test('axe finds no violations with the disclosure open', async ({ page }) => {
    const bundle = AXE_BUNDLE;
    if (!bundle) {
      test.skip(true, 'axe-core browser bundle not installed — see AXE_BUNDLE above');
      return;
    }

    await page.setViewportSize(NARROW);
    await signIn(page, PERSONAS.admin);
    await gotoEventsSettled(page);
    await openNavMenu(page);

    await page.addScriptTag({ path: bundle });
    const violations = await page.evaluate(async () => {
      const results = await window.axe.run(document, { resultTypes: ['violations'] });
      return results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.map((node) => node.target.join(' ')),
      }));
    });

    expect(violations, `axe violations:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
  });
});

/**
 * Vertical centres of a nav's interactive rows, plus the identity span when `persona` is given
 * (pass `null` once the address has been rewritten and no longer matches).
 *
 * Centres rather than tops: rows legitimately differ in height (the Admin pill is not a plain
 * link), but on one line their centres agree to within a pixel or two, while a wrapped item
 * drops by a whole line box. The old header used `flex-wrap`, so it never overflowed — it
 * silently grew a second row, which is precisely why an overflow check alone missed it.
 */
async function rowCentres(menu: Locator, persona: Persona | null): Promise<number[]> {
  return menu.evaluate((root, email) => {
    const rows: Element[] = Array.from(root.querySelectorAll('a, button'));
    if (email) {
      const identity = Array.from(root.querySelectorAll('span')).find(
        (el) => el.textContent?.trim() === email && el.closest('a, button') === null,
      );
      if (identity) rows.push(identity);
    }
    return rows.map((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
  }, persona?.email ?? null);
}

/**
 * Assert every measured centre sits on one line (8px of tolerance for font metrics).
 *
 * A plain helper rather than an `expect.extend` matcher: a custom matcher needs a module
 * augmentation to survive `npm run typecheck:tests`, which is a separate gate from
 * `npm run typecheck` (the root tsconfig is solution-style and does not reference
 * `tsconfig.test.json`, so specs escape `tsc -b` entirely). The machinery bought nothing a
 * function cannot do.
 */
function expectOnOneLine(centres: number[], what: string): void {
  expect(centres.length, `${what}: measured no nav rows at all`).toBeGreaterThan(0);
  const spread = Math.max(...centres) - Math.min(...centres);
  expect(
    spread,
    `${what}: expected ${centres.length} nav rows on one line, but their vertical centres spread ` +
      `${spread.toFixed(1)}px (${centres.map((c) => c.toFixed(1)).join(', ')})`,
  ).toBeLessThanOrEqual(8);
}
