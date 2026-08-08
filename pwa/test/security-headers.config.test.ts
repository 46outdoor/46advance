import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Automated header assertion (WS-I): the deployed security headers come from firebase.json's hosting
// config; assert the config carries them so a regression is caught in CI (the live response is also
// checked by the post-deploy smoke step).
interface HeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}
// Vitest runs with cwd = the pwa/ project root, where firebase.json lives.
const config = JSON.parse(readFileSync(resolve(process.cwd(), 'firebase.json'), 'utf8')) as {
  hosting: { headers: HeaderRule[] };
};

const allPaths = config.hosting.headers.find((h) => h.source === '**');
const byKey = new Map((allPaths?.headers ?? []).map((h) => [h.key, h.value]));

describe('hosting security headers (WS-I)', () => {
  it('applies the safe security headers to every path', () => {
    expect(allPaths).toBeTruthy();
    expect(byKey.get('X-Content-Type-Options')).toBe('nosniff');
    expect(byKey.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(byKey.get('Referrer-Policy')).toContain('strict-origin');
    expect(byKey.get('Permissions-Policy')).toBeTruthy();
    expect(byKey.get('Strict-Transport-Security')).toContain('max-age=');
  });

  it('ships an enforced CSP covering the key directives + required sources', () => {
    const csp = byKey.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
    // The Google (Picker/Sign-in), Sentry, and Firebase sources the app needs must be allow-listed.
    expect(csp).toContain('apis.google.com');
    expect(csp).toContain('ingest');
    expect(csp).toContain('googleapis.com');
    // Enforce shipped after the 2026-07-24 → 2026-08-08 report-only observation window closed
    // clean (#264). Reverting to report-only is a deliberate rollback, never silent drift.
    expect(byKey.has('Content-Security-Policy-Report-Only')).toBe(false);
  });
});
