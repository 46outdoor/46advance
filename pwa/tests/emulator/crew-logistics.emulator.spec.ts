/**
 * Travel & Lodging panel — the privacy boundary in a real browser
 * (planning/CREW_TRAVEL_LODGING_PLAN.md §4.7).
 *
 * The plan makes one E2E requirement non-negotiable: **the crew case signs in as `tech`,
 * not admin.** The 2026-08-10 slug bug shipped precisely because every routing test used
 * an oversight account, and this surface has the same failure shape — the panel's crew
 * path issues a uid-constrained query that an unconstrained one would turn into a
 * permission error an admin can never reproduce.
 *
 * Seeded fixtures (seed.ts): two lodging records on Alpha — `Hampton Inn Alpha`
 * belongs to the tech persona; `Marriott Alpha` belongs to an unlinked contact.
 */
import { test, expect } from '@playwright/test';
import { signIn } from './fixtures';
import { PERSONAS } from './personas';

test.describe('crew travel & lodging — per-person visibility', () => {
  test('a tech sees ONLY their own record, read-only', async ({ page }) => {
    await signIn(page, PERSONAS.tech);
    await page.goto('/events/alpha-festival');
    await expect(page.getByRole('heading', { name: 'Travel & Lodging' })).toBeVisible();

    // Their own stay renders — including the sensitive fields, which are theirs to see.
    await expect(page.getByText('Hampton Inn Alpha')).toBeVisible();
    await expect(page.getByText('Conf # TECH123')).toBeVisible();

    // The other crew member's stay must not appear anywhere on the page.
    await expect(page.getByText('Marriott Alpha')).toHaveCount(0);
    await expect(page.getByText('NOLINK456')).toHaveCount(0);

    // Read-only: no management affordances inside the panel.
    const panel = page.getByRole('region', { name: 'Travel and lodging' });
    await expect(panel.getByRole('button', { name: 'Add record' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  });

  test('the PM sees every record, grouped by person, with management controls', async ({
    page,
  }) => {
    await signIn(page, PERSONAS.pm);
    await page.goto('/events/alpha-festival');
    await expect(page.getByRole('heading', { name: 'Travel & Lodging' })).toBeVisible();

    // Scope to the panel's named region landmark: the Crew panel renders the same
    // people's names as headings too, and an unscoped getByRole is a strict-mode violation.
    const panel = page.getByRole('region', { name: 'Travel and lodging' });

    // Both records, with their group headers resolved from the roster.
    await expect(panel.getByText('Hampton Inn Alpha')).toBeVisible();
    await expect(panel.getByText('Marriott Alpha')).toBeVisible();
    await expect(
      panel.getByRole('heading', { name: PERSONAS.tech.displayName }),
    ).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Norma Nolink' })).toBeVisible();

    // Management affordances present.
    await expect(panel.getByRole('button', { name: 'Add record' })).toBeVisible();
  });

  test('a department lead with no records sees no panel at all', async ({ page }) => {
    // The lead persona has no linked contact and no records: the panel must render
    // nothing — not an empty shell — per plan §4.4.
    await signIn(page, PERSONAS.lead);
    await page.goto('/events/alpha-festival');
    await expect(page.getByRole('heading', { name: 'Alpha Festival', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Travel & Lodging' })).toHaveCount(0);
  });
});
