/**
 * Event URL slugs. An event is addressable at `/events/{slug}` (falling back to the
 * Firestore id for old links / un-slugged events). The default is derived from the
 * booking label (else the name) plus the 2-digit start year — e.g. booking label
 * "RTC Ashland" + 2026 → `rtc-ashland-26`. Editable at creation; unique per event.
 */

/** URL-safe slug: lowercase, fold accents, non-alphanumerics → single hyphens, trimmed. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD') // splits accented letters into base + combining mark
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // combining marks, spaces, punctuation → hyphen
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Default slug: slugify(bookingLabel || name) with the 2-digit start year appended. */
export function defaultEventSlug(
  bookingLabel: string | null | undefined,
  name: string,
  startDate: Date | null,
): string {
  const base = slugify((bookingLabel ?? '').trim() || name);
  const yy = startDate ? String(startDate.getFullYear()).slice(-2) : '';
  if (!base) return yy;
  if (!yy || base.endsWith(yy)) return base;
  return `${base}-${yy}`;
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
