/**
 * S4 cross-user cache isolation (WS-C / F-4). Exercises the full sign-out path on a shared
 * browser end-to-end: AuthProvider cancels/clears the React Query cache on the identity
 * transition, clears the Firestore persistent cache, and hard-reloads — then a different
 * account signs in on the SAME browser and must render only its own identity and data with
 * no trace of the previous account. (Guards the sign-out/terminate/reload/re-sign-in flow;
 * the cache clears themselves are exercised by construction in AuthProvider.)
 */
import { test, expect } from '@playwright/test';
import { signIn, signOut } from './fixtures';
import { PERSONAS } from './personas';

test.describe('S4 cross-user cache isolation', () => {
  test('signing out then in as a different user shows only the new account, on one browser', async ({
    page,
  }) => {
    // First user signs in and loads their events.
    await signIn(page, PERSONAS.pm);
    await page.goto('/events');
    await expect(page.getByText('pm@e2e.test')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alpha Festival' })).toBeVisible();

    // Sign out — clears the React Query + Firestore caches and reloads to a clean app.
    await signOut(page);

    // A different account signs in on the SAME browser: it must render the new identity and
    // the new user's events, with no trace of the previous account.
    await signIn(page, PERSONAS.crossEvent);
    await page.goto('/events');
    await expect(page.getByText('cross@e2e.test')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Beta Festival' })).toBeVisible();
    await expect(page.getByText('pm@e2e.test')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Alpha Festival' })).toHaveCount(0);
  });
});
