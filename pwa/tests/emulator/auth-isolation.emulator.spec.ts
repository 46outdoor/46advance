/**
 * S0 proof (Phase 0): the authenticated emulator foundation works.
 *
 * - deterministic identities authenticate against the emulators;
 * - two users hold independent auth state in isolated browser contexts;
 * - seeded data renders for an authorized viewer;
 * - the AuthGate holds unverified/unapproved accounts.
 *
 * The full authenticated workflow catalog (approval/revocation, documents,
 * schedules, cache isolation) is WS-J / S4+ — not this file.
 *
 * The per-member event-list query is included here: the top-level collection-group
 * rule authorizes only the caller's own membership rows, so each non-admin sees only
 * events to which they belong.
 */
import { test, expect } from '@playwright/test';
import { openAs, signIn } from './fixtures';
import { PERSONAS } from './personas';

test.describe('S0 authenticated emulator foundation', () => {
  test('admin authenticates and sees every seeded event', async ({ page }) => {
    await signIn(page, PERSONAS.admin);
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: 'Events', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alpha Festival' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Beta Festival' })).toBeVisible();
  });

  test('two users hold independent identities in isolated contexts', async ({ browser }) => {
    const pm = await openAs(browser, 'pm');
    const cross = await openAs(browser, 'crossEvent');
    try {
      await pm.page.goto('/events');
      await cross.page.goto('/events');

      // Each context is authenticated as its own user — no identity bleed between them.
      await expect(pm.page.getByText('pm@e2e.test')).toBeVisible();
      await expect(pm.page.getByText('cross@e2e.test')).toHaveCount(0);

      await expect(cross.page.getByText('cross@e2e.test')).toBeVisible();
      await expect(cross.page.getByText('pm@e2e.test')).toHaveCount(0);

      await expect(pm.page.getByRole('heading', { name: 'Alpha Festival' })).toBeVisible();
      await expect(pm.page.getByRole('heading', { name: 'Beta Festival' })).toHaveCount(0);
      await expect(cross.page.getByRole('heading', { name: 'Beta Festival' })).toBeVisible();
      await expect(cross.page.getByRole('heading', { name: 'Alpha Festival' })).toHaveCount(0);
    } finally {
      await pm.context.close();
      await cross.context.close();
    }
  });

  test('an unverified account is held at the verify-email gate', async ({ page }) => {
    await signIn(page, PERSONAS.pending);
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: /verify your email/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Events', level: 1 })).toHaveCount(0);
  });

  test('a verified but unapproved account is held at the approval gate', async ({ page }) => {
    await signIn(page, PERSONAS.revoked);
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: /pending approval/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Events', level: 1 })).toHaveCount(0);
  });
});
