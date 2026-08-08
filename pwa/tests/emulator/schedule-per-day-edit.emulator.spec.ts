/**
 * Per-day edit mode on the event schedule. The screen used to have ONE screen-wide Edit
 * toggle that put every day card into edit state at once; editing is now scoped to a
 * single day, so this pins the behavior that replaced it:
 *
 *   - schedule-level tools (add day / shift) are available to editors with no mode to enter
 *   - each day card carries its own Edit/Done control
 *   - turning one day on turns any other day off (one at a time)
 *
 * Days are created through the UI rather than seeded, so the rehomed "+ Add day" toolbar is
 * exercised on the way in. Runs on the auth + firestore lane (no functions emulator needed —
 * day writes go straight to Firestore under the rules).
 */
import { test, expect, type Page } from '@playwright/test';
import { signIn } from './fixtures';
import { PERSONAS } from './personas';

/** One day's card, addressed by its header date. The screen itself is a <section> wrapping
 * every card, so exclude the one carrying the page heading to land on the card. */
function dayCard(page: Page, dateLabel: string) {
  return page
    .locator('section')
    .filter({ hasText: dateLabel })
    .filter({ hasNotText: 'Schedule —' });
}

async function addDay(page: Page, date: string): Promise<void> {
  await page.getByRole('button', { name: '+ Add day' }).click();
  await page.getByLabel(/date/i).first().fill(date);
  await page.getByRole('button', { name: 'Add day' }).click();
  await expect(page.getByRole('button', { name: '+ Add day' })).toBeVisible();
}

test.describe('schedule — per-day edit mode', () => {
  test('editors get schedule tools with no global mode, and edit one day at a time', async ({
    page,
  }) => {
    await signIn(page, PERSONAS.pm);
    await page.goto('/events/e2e-event-alpha/schedule');
    await expect(page.getByRole('heading', { level: 1, name: /Schedule/ })).toBeVisible();

    // No screen-wide toggle survives: the old control read "Edit" / "Done editing" and sat
    // in the header next to the h1.
    await expect(page.getByRole('button', { name: 'Done editing' })).toHaveCount(0);

    // Schedule-level tools are available immediately — no mode to enter first.
    await expect(page.getByRole('button', { name: '+ Add day' })).toBeVisible();

    await addDay(page, '2026-09-01');
    await addDay(page, '2026-09-02');

    const first = dayCard(page, 'Sep 1, 2026');
    const second = dayCard(page, 'Sep 2, 2026');

    // Each card owns its own control, and starts closed.
    const firstToggle = first.getByRole('button', { name: 'Edit' });
    const secondToggle = second.getByRole('button', { name: 'Edit' });
    await expect(firstToggle).toBeVisible();
    await expect(secondToggle).toBeVisible();
    await expect(first.getByRole('button', { name: '+ Add item' })).toHaveCount(0);

    // Opening one day exposes that day's controls — and only that day's.
    await firstToggle.click();
    await expect(first.getByRole('button', { name: 'Done' })).toBeVisible();
    await expect(first.getByRole('button', { name: '+ Add item' })).toBeVisible();
    await expect(second.getByRole('button', { name: '+ Add item' })).toHaveCount(0);

    // One at a time: opening the second closes the first.
    await second.getByRole('button', { name: 'Edit' }).click();
    await expect(second.getByRole('button', { name: '+ Add item' })).toBeVisible();
    await expect(first.getByRole('button', { name: '+ Add item' })).toHaveCount(0);
    await expect(first.getByRole('button', { name: 'Edit' })).toBeVisible();

    // Done closes it, leaving nothing editable.
    await second.getByRole('button', { name: 'Done' }).click();
    await expect(second.getByRole('button', { name: '+ Add item' })).toHaveCount(0);
    await expect(second.getByRole('button', { name: 'Edit' })).toBeVisible();
  });

  test('a read-only member sees no edit controls at all', async ({ page }) => {
    await signIn(page, PERSONAS.tech);
    await page.goto('/events/e2e-event-alpha/schedule');
    await expect(page.getByRole('heading', { level: 1, name: /Schedule/ })).toBeVisible();

    await expect(page.getByRole('button', { name: '+ Add day' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });
});
