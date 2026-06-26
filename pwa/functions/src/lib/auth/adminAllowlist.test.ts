import { describe, expect, it } from 'vitest';
// No extension specifier: this test is excluded from the nodenext tsc build and
// run by Vitest, which resolves the sibling `.ts` directly.
import { DEFAULT_ADMIN_EMAIL, isAdminEmail, parseAdminEmails } from './adminAllowlist';

describe('parseAdminEmails', () => {
  it('falls back to the default app-admin when unset or blank', () => {
    expect(parseAdminEmails(undefined)).toEqual([DEFAULT_ADMIN_EMAIL]);
    expect(parseAdminEmails('')).toEqual([DEFAULT_ADMIN_EMAIL]);
    expect(parseAdminEmails('   ')).toEqual([DEFAULT_ADMIN_EMAIL]);
  });

  it('splits, trims, and lowercases a comma-separated list', () => {
    expect(parseAdminEmails('A@x.com, B@Y.com ,c@z.com')).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
  });

  it('drops blank entries and de-duplicates (case-insensitively)', () => {
    expect(parseAdminEmails('a@x.com,,a@x.com, ,A@X.com')).toEqual(['a@x.com']);
  });

  it('honors an explicit fallback when provided', () => {
    expect(parseAdminEmails(undefined, 'owner@example.com')).toEqual(['owner@example.com']);
  });
});

describe('isAdminEmail', () => {
  const allow = parseAdminEmails('jared@46entertainment.com');

  it('matches case-insensitively', () => {
    expect(isAdminEmail('JARED@46entertainment.com', allow)).toBe(true);
    expect(isAdminEmail('jared@46entertainment.com', allow)).toBe(true);
  });

  it('rejects non-members and null/undefined', () => {
    expect(isAdminEmail('someone@else.com', allow)).toBe(false);
    expect(isAdminEmail(null, allow)).toBe(false);
    expect(isAdminEmail(undefined, allow)).toBe(false);
  });
});
