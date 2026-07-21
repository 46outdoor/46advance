/**
 * Authenticated Playwright helpers for the emulator suite (Phase 0 / S0).
 *
 * `signIn` drives the real /sign-in UI so a test exercises the app's actual auth
 * path. `openAs` gives each persona its own isolated browser context — the basis
 * for two-user isolation tests (WS-C / S4 will assert cache isolation on top of it).
 */
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { PERSONAS, TEST_PASSWORD, type Persona, type PersonaKey } from './personas';

/** Sign a persona in via the UI. Resolves once the app has navigated off /sign-in
 * (SignInScreen routes to '/' on success; bad credentials keep it on /sign-in). */
export async function signIn(page: Page, persona: Persona): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(persona.email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
}

export interface AuthedSession {
  context: BrowserContext;
  page: Page;
  persona: Persona;
}

/** Open a fresh, isolated browser context signed in as the given persona. Caller
 * must `context.close()` when done. */
export async function openAs(browser: Browser, key: PersonaKey): Promise<AuthedSession> {
  const persona = PERSONAS[key];
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, persona);
  return { context, page, persona };
}
