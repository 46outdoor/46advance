/**
 * Playwright globalSetup for the authenticated emulator suite (Phase 0 / S0).
 * Seeds the demo emulators once before any spec runs. Runs inside
 * `firebase emulators:exec`, so the emulator host env vars are present.
 */
import { seedEmulator } from './seed';

async function globalSetup(): Promise<void> {
  await seedEmulator();
}

export default globalSetup;
