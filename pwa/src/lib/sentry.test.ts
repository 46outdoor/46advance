import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Sentry SDK so the tests assert wiring, not network calls.
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// Each test re-imports a fresh module graph so the module-level `initialized`
// flag + logger sink reset between cases.
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('initSentry', () => {
  it('is a no-op when no DSN is configured', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const Sentry = await import('@sentry/react');
    const { initSentry } = await import('@/lib/sentry');
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initializes Sentry and routes log lines to breadcrumbs when a DSN is set', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o1.ingest.sentry.io/1');
    const Sentry = await import('@sentry/react');
    const { initSentry } = await import('@/lib/sentry');
    const { createLogger } = await import('@/lib/logger');

    initSentry();
    expect(Sentry.init).toHaveBeenCalledOnce();

    createLogger('Feature').warn('heads up', { code: 1 });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'Feature', level: 'warning', message: 'heads up' }),
    );
  });
});

describe('captureExceptionToSentry', () => {
  it('sends a single event after init', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o1.ingest.sentry.io/1');
    const Sentry = await import('@sentry/react');
    const { initSentry, captureExceptionToSentry } = await import('@/lib/sentry');
    initSentry();
    captureExceptionToSentry(new Error('boom'), { source: 'test' });
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it('is a no-op before init / without a DSN', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const Sentry = await import('@sentry/react');
    const { captureExceptionToSentry } = await import('@/lib/sentry');
    captureExceptionToSentry(new Error('boom'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
