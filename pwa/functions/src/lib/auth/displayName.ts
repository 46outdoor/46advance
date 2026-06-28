/**
 * Resolve the display name to store for a user on sign-in — newest-wins-but-never-clobber:
 * keep an existing (e.g. admin-set) name, else the auth token's `name`, else a pre-added
 * contact's name. Blank/whitespace values are ignored. Returns null when nothing usable is
 * available (callers fall back to email for display).
 *
 * The "keep existing" rule is what stops every sign-in from wiping an admin-set name back to
 * the (often absent) token name for email/password accounts.
 */
function trimmedOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function resolveDisplayName(
  existing: unknown,
  tokenName: unknown,
  contactName: string | null,
): string | null {
  return trimmedOrNull(existing) ?? trimmedOrNull(tokenName) ?? trimmedOrNull(contactName);
}
