/**
 * Event URL slug helpers (server copy; mirrors the client `src/lib/events/slug.ts`).
 * The client computes the desired slug from the booking label/name + year and sends it;
 * the server defensively re-slugifies and enforces uniqueness across events.
 */

/** URL-safe slug: lowercase, fold accents, non-alphanumerics → single hyphens, trimmed. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Make `base` unique against `taken` by appending -2, -3, … (returns `base` if free). */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (base && !set.has(base)) return base;
  const stem = base || 'event';
  for (let i = 2; ; i += 1) {
    const candidate = `${stem}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
}
