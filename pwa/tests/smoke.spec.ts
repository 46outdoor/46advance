import { test, expect } from '@playwright/test';

/**
 * Minimal E2E smoke net (the tier AGENTS.md advertises). Exercises only unauthenticated pages,
 * so it needs no Firebase backend/emulator — just that the app boots, renders, and the auth gate
 * redirects. Run locally with `npm run test:e2e` (after `npx playwright install chromium`).
 */
test.describe('smoke', () => {
  test('landing page renders with a sign-in link', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '46 Advance' })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });

  test('a protected route redirects an unauthenticated visitor to sign-in', async ({ page }) => {
    await page.goto('/events');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('sign-in page is reachable directly', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });
});
