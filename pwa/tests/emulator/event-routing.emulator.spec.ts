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

/**
 * Regression: the same routing, for a viewer WITHOUT oversight.
 *
 * Every test above signs in as `admin`, and that is exactly how the bug shipped. An admin (or a
 * production director) escapes the whole problem because `canOverseeAllEvents()` is
 * unconditionally true, which makes the `where('slug','==')` collection query authorizable. For
 * anyone else the rule needs a per-document `exists()` membership lookup, Firestore refuses the
 * query, and the old fallback — a getDoc treating the SLUG as a doc id — was denied rather than
 * empty, so it threw. A tech opening the show they are assigned to got "Failed to load this
 * event." Found in production 2026-08-10, the first day a non-oversight account existed.
 *
 * `tech` is deliberate: the lowest role there is. If resolution works for them it works for
 * every member, and the assertions below are the ones that fail against the old resolver.
 */
test.describe('event slug routing — without oversight', () => {
  test('a tech opens their event by slug, by doc id, and via the canonicalizing redirect', async ({
    page,
  }) => {
    await signIn(page, PERSONAS.tech); // tech on e2e-event-alpha, no global claim

    // By slug — the form EventsListScreen actually links to, and the one that used to fail.
    await page.goto('/events/alpha-festival');
    await expect(page.getByRole('heading', { name: 'Alpha Festival', level: 1 })).toBeVisible();

    // By raw doc id. This also exercises the redirect at EventDetailScreen: the screen
    // canonicalizes `/events/{id}` → `/events/{slug}`, so a resolver that only handled ids
    // would load once and then break itself on the rewritten URL.
    await page.goto('/events/e2e-event-alpha');
    await expect(page.getByRole('heading', { name: 'Alpha Festival', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/events\/alpha-festival$/);
    // Still rendered AFTER the redirect settles — the failure mode was load-then-error.
    await expect(page.getByText('Failed to load this event.')).toHaveCount(0);
  });

  test('an event they are not on reads as no-access, never as a load failure', async ({ page }) => {
    // crossEvent is PM on beta only, so beta's slug is a real event this viewer cannot see.
    await signIn(page, PERSONAS.tech);
    await page.goto('/events/beta-festival');

    // The distinction matters: "Failed to load" says the app broke, and is what a denial used
    // to surface as. Absence of access must read as absence of access.
    await expect(page.getByText(/Event not found|don’t have access/)).toBeVisible();
    await expect(page.getByText('Failed to load this event.')).toHaveCount(0);
  });
});
