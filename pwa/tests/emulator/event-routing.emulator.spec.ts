/**
 * WS-J: event slug ↔ id resolution — the deep-link / hard-refresh critical path that
 * every event screen depends on (`useResolvedEvent` → `getEventBySlugOrId`: query by the
 * readable `slug`, fall back to the raw doc id). Reads seeded events only, so it runs on
 * the auth + firestore + storage lane with no functions emulator.
 *
 * Deferred (needs the functions emulator, which this lane does not boot): event CREATION
 * and slug RENAME, both of which call the transactional slug-reservation callables
 * (functions/src/eventSlug.ts). Track under the WS-J follow-up in the plan.
 */
import { test, expect } from '@playwright/test';
import { signIn } from './fixtures';
import { PERSONAS } from './personas';

test.describe('event slug routing', () => {
  test('resolves a seeded event by readable slug and by raw doc id', async ({ page }) => {
    await signIn(page, PERSONAS.admin);

    // Readable slug deep-link.
    await page.goto('/events/alpha-festival');
    await expect(page.getByRole('heading', { name: 'Alpha Festival', level: 1 })).toBeVisible();

    // The same event by its raw Firestore doc id — both route params must resolve identically.
    await page.goto('/events/e2e-event-alpha');
    await expect(page.getByRole('heading', { name: 'Alpha Festival', level: 1 })).toBeVisible();
  });

  test('an unknown event param shows the not-found state, not a crash', async ({ page }) => {
    await signIn(page, PERSONAS.admin);
    await page.goto('/events/no-such-event');
    await expect(page.getByText(/Event not found/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Festival/ })).toHaveCount(0);
  });
});
