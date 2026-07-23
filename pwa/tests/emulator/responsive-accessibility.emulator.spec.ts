import { test, expect } from '@playwright/test';
import { signIn } from './fixtures';
import { PERSONAS } from './personas';

test.describe('authenticated responsive shell', () => {
  test('keeps navigation and event actions visible without horizontal overflow at mobile width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, PERSONAS.pm);
    await page.goto('/events');

    await expect(page.getByRole('link', { name: 'Events' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Contacts' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Documents' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alpha Festival' })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
});
