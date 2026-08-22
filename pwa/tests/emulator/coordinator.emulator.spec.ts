/**
 * Production coordinator — cross-event read + the four narrow writes, in a real browser
 * (CREW_TRAVEL_LODGING_PLAN §5.4). The persona holds NO membership rows, so every
 * capability below is the claim doing the work — the same discipline as the director spec,
 * with the opposite write expectations on exactly four surfaces.
 */
import { test, expect } from '@playwright/test';
import { signIn } from './fixtures';
import { PERSONAS } from './personas';

test.describe('production coordinator — read everywhere, write four things', () => {
  test('discovers every event without a single membership', async ({ page }) => {
    await signIn(page, PERSONAS.coordinator);
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: 'Alpha Festival' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Beta Festival' })).toBeVisible();
  });

  test('opens an event read-only, but the Travel & Lodging panel offers management', async ({
    page,
  }) => {
    await signIn(page, PERSONAS.coordinator);
    await page.goto('/events/alpha-festival');
    await expect(page.getByRole('heading', { name: 'Alpha Festival', level: 1 })).toBeVisible();

    // Not an event editor. A bare { name: 'Edit' } check would false-fail here — the
    // logistics panel legitimately offers Edit to a coordinator — so assert the
    // event-editor affordances by name instead.
    await expect(page.getByRole('button', { name: 'Add stage' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Generate packet$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add slot' })).toHaveCount(0);

    // But the logistics write is theirs.
    const panel = page.getByRole('region', { name: 'Travel and lodging' });
    await expect(panel.getByRole('button', { name: 'Add record' })).toBeVisible();
  });

  test('edits the schedule — the claim carries schedule days', async ({ page }) => {
    await signIn(page, PERSONAS.coordinator);
    await page.goto('/events/alpha-festival/schedule');
    await expect(page.getByRole('button', { name: '+ Add day' })).toBeVisible();
  });

  test('reaches the cross-event Contacts directory from the nav', async ({ page }) => {
    await signIn(page, PERSONAS.coordinator);
    await page.goto('/events');
    await expect(page.getByRole('link', { name: 'Contacts' })).toBeVisible();
  });
});
