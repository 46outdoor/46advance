import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Sentry SDK so the tests assert wiring, not network calls.
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// Each test re-imports a fresh module graph so the module-level `initialized` flag + logger sink
// reset between cases.
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const DSN = 'https://key@o1.ingest.sentry.io/1';

describe('initSentry', () => {
  it('is a no-op when no DSN is configured (inert until provisioned)', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const Sentry = await import('@sentry/react');
    const { initSentry } = await import('@/lib/sentry');
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initializes with the DSN and PII disabled when configured', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    const Sentry = await import('@sentry/react');
    const { initSentry } = await import('@/lib/sentry');
    initSentry();
    expect(Sentry.init).toHaveBeenCalledOnce();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: DSN, sendDefaultPii: false }));
  });

  it('isSentryActive reflects whether a DSN activated it', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const off = await import('@/lib/sentry');
    off.initSentry();
    expect(off.isSentryActive()).toBe(false);

    vi.resetModules();
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    const on = await import('@/lib/sentry');
    on.initSentry();
    expect(on.isSentryActive()).toBe(true);
  });
});

describe('log sink (DSN present)', () => {
  async function setup() {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    const Sentry = await import('@sentry/react');
    const { initSentry } = await import('@/lib/sentry');
    const { createLogger } = await import('@/lib/logger');
    initSentry();
    return { Sentry, log: createLogger('Feature') };
  }

  it('breadcrumbs non-error levels without creating an event', async () => {
    const { Sentry, log } = await setup();
    log.warn('heads up', { code: 1 });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'Feature', level: 'warning', message: 'heads up' }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('turns an error-level line carrying an Error into an exception event (F-12)', async () => {
    const { Sentry, log } = await setup();
    const err = new Error('boom');
    log.error('it broke', { error: err, source: 'X' });
    expect(Sentry.captureException).toHaveBeenCalledWith(err, { extra: { source: 'X' } });
    expect(Sentry.addBreadcrumb).toHaveBeenCalled(); // still adds the trailing breadcrumb
  });

  it('turns an error-level line without an Error into a message event', async () => {
    const { Sentry, log } = await setup();
    log.error('bad thing', { code: 500 });
    expect(Sentry.captureMessage).toHaveBeenCalledWith('[Feature] bad thing', { level: 'error', extra: { code: 500 } });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('captureError — exactly one event (no double-report from error boundaries)', () => {
  it('routes through the logger sink to a single captureException', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    const Sentry = await import('@sentry/react');
    const { initSentry } = await import('@/lib/sentry');
    const { captureError } = await import('@/lib/errorCapture');
    initSentry();

    const err = new Error('render failed');
    captureError(err, { source: 'AppErrorBoundary', componentStack: '...' });

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      extra: { source: 'AppErrorBoundary', componentStack: '...' },
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('captures nothing when Sentry is not initialized', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const Sentry = await import('@sentry/react');
    const { initSentry } = await import('@/lib/sentry');
    const { captureError } = await import('@/lib/errorCapture');
    initSentry();
    captureError(new Error('boom'), { source: 'X' });
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
