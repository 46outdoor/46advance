/**
 * Production-director oversight (planning/EVENT_OVERSIGHT_ROLE_PLAN.md).
 *
 * The capability's whole point is access WITHOUT assignment, so the `director` persona
 * deliberately holds no membership rows at all (see personas.ts). These tests prove the
 * three properties that make it safe:
 *
 *  1. reach — a director opens every event, including ones they were never added to;
 *  2. read-only — no edit affordance appears on an event they don't belong to;
 *  3. containment — the Tracker gate follows capability, not curiosity: leads and techs
 *     lose it entirely, while a PM keeps it scoped to the shows they actually run.
 *
 * `directorTech` covers the additive case: a low per-event role must not downgrade the
 * global read, and must not add a write.
 */
import { test, expect } from '@playwright/test';
import { openAs, signIn } from './fixtures';
import { PERSONAS } from './personas';

test.describe('production director — cross-event oversight', () => {
  test('sees every event without holding a single membership', async ({ page }) => {
    await signIn(page, PERSONAS.director);
    await page.goto('/events');

    // Alpha and Beta belong to other people entirely; the director is on neither.
    await expect(page.getByRole('heading', { name: 'Alpha Festival' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Beta Festival' })).toBeVisible();
  });

  test('opens an unassigned event read-only', async ({ page }) => {
    await signIn(page, PERSONAS.director);
    await page.goto('/events/alpha-festival');

    await expect(page.getByRole('heading', { name: 'Alpha Festival', level: 1 })).toBeVisible();
    // The denial state must NOT appear — reaching the event is the capability.
    await expect(page.getByText(/don’t have access/i)).toHaveCount(0);

    // Mutation affordances are derived from canEditEvent, which is false without a PM row.
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add stage' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Generate packet$/ })).toHaveCount(0);
  });

  test('reaches the tracker for an event it is not a member of', async ({ page }) => {
    await signIn(page, PERSONAS.director);
    await page.goto('/tracker');

    await expect(page.getByRole('heading', { name: 'Advance tracker' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alpha Festival' })).toBeVisible();
  });

  test('a low per-event role neither downgrades the global read nor grants writes', async ({
    page,
  }) => {
    // directorTech is a tech on Alpha only, plus the global claim.
    await signIn(page, PERSONAS.directorTech);

    // Beta — no membership at all — still reachable via the claim.
    await page.goto('/events/beta-festival');
    await expect(page.getByRole('heading', { name: 'Beta Festival', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);

    // Alpha — where they hold `tech` — must not gain edit rights from the claim either.
    await page.goto('/events/alpha-festival');
    await expect(page.getByRole('heading', { name: 'Alpha Festival', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });
});

test.describe('tracker visibility follows capability', () => {
  test('a PM sees the tracker; a tech and a lead do not', async ({ browser }) => {
    const pm = await openAs(browser, 'pm');
    const tech = await openAs(browser, 'tech');
    const lead = await openAs(browser, 'lead');
    try {
      for (const s of [pm, tech, lead]) await s.page.goto('/events');

      // PM of Alpha → tracker is theirs.
      await expect(pm.page.getByRole('link', { name: 'Tracker' })).toBeVisible();

      // Read-only crew → no tracker entry point anywhere in the chrome.
      await expect(tech.page.getByRole('link', { name: 'Tracker' })).toHaveCount(0);
      await expect(lead.page.getByRole('link', { name: 'Tracker' })).toHaveCount(0);
    } finally {
      await Promise.all([pm.context.close(), tech.context.close(), lead.context.close()]);
    }
  });

  test('a tech navigating straight to /tracker is redirected away', async ({ page }) => {
    await signIn(page, PERSONAS.tech);
    await page.goto('/tracker');

    // Hiding the link is not the gate — the route itself must refuse.
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.getByRole('heading', { name: 'Advance tracker' })).toHaveCount(0);
  });
});
