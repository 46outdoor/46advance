/**
 * Admin bootstrap allowlist.
 *
 * The set of emails granted the global `admin` claim by `syncUserClaims`. Sourced
 * from the `ADMIN_EMAILS` env var (comma-separated) so the canonical owner can be
 * rotated without a code change / redeploy of new source; falls back to the
 * project's app-admin identity when unset.
 *
 * NOTE: this is the *application* admin — distinct from the Google account that
 * owns the GCP project `advancethat` (see ../../../../AGENTS.md § Firebase Backend).
 */
export const DEFAULT_ADMIN_EMAIL = 'jared@46entertainment.com';

/**
 * Parse a comma-separated admin allowlist into normalized emails: trimmed,
 * lowercased, de-duplicated, with blank entries dropped. Falls back to `fallback`
 * when `raw` is undefined or contains no non-whitespace characters.
 */
export function parseAdminEmails(raw: string | undefined, fallback: string = DEFAULT_ADMIN_EMAIL): string[] {
  const source = raw != null && raw.trim().length > 0 ? raw : fallback;
  const normalized = source
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
  return Array.from(new Set(normalized));
}

/** Case-insensitive membership check of `email` against a parsed allowlist. */
export function isAdminEmail(email: string | null | undefined, allowlist: readonly string[]): boolean {
  return email != null && allowlist.includes(email.toLowerCase());
}
