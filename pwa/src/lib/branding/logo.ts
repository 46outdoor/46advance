/**
 * Brand logo model. A logo is a **pair** of image variants so it can render on any
 * background: `onDark` (white/light mark — for dark covers/headers) and `onLight`
 * (dark/color mark — for white pages / light content). Either may be absent; render
 * code falls back to the other. Images live in Storage; only refs are stored here.
 *
 * Used by the per-template / per-event `eventLogo` (the show-specific mark) and the
 * app-level shared defaults (`config/branding.defaultLogos` — e.g. 46, Peachtree).
 */
import { z } from 'zod';

export interface LogoImage {
  path: string;
  url: string;
}

export interface Logo {
  /** White/light mark for DARK backgrounds (packet cover, dark nav/header). */
  onDark: LogoImage | null;
  /** Dark/color mark for LIGHT backgrounds (white title-block, light content). */
  onLight: LogoImage | null;
  /** Optional label, e.g. "46 Entertainment". */
  name: string | null;
}

const logoImageSchema = z.object({ path: z.string().min(1), url: z.string().min(1) });

export const logoSchema = z.object({
  onDark: logoImageSchema.nullable().optional(),
  onLight: logoImageSchema.nullable().optional(),
  name: z.string().nullable().optional(),
});

export function parseLogo(data: unknown): Logo {
  const d = logoSchema.parse(data);
  return { onDark: d.onDark ?? null, onLight: d.onLight ?? null, name: d.name ?? null };
}

export const emptyLogo = (): Logo => ({ onDark: null, onLight: null, name: null });

/** The Storage paths a logo references (its two variants). */
export function logoPaths(logo: Logo): string[] {
  return [logo.onDark?.path, logo.onLight?.path].filter((p): p is string => !!p);
}

/** Storage paths referenced by `prev` but no longer referenced by `next` — the objects a
 *  replace/remove superseded, safe to delete once `next` is durably persisted (F-5). */
export function supersededLogoPaths(prev: Logo, next: Logo): string[] {
  const kept = new Set(logoPaths(next));
  return logoPaths(prev).filter((p) => !kept.has(p));
}

/** True if the logo has at least one usable variant. */
export function hasLogo(logo: Logo | null | undefined): logo is Logo {
  return !!logo && (logo.onDark !== null || logo.onLight !== null);
}

/** Pick the variant for a background, falling back to the other if it's missing. */
export function logoForBackground(logo: Logo, background: 'dark' | 'light'): LogoImage | null {
  const primary = background === 'dark' ? logo.onDark : logo.onLight;
  const fallback = background === 'dark' ? logo.onLight : logo.onDark;
  return primary ?? fallback;
}

/**
 * The effective logo row, capped at 3: the show mark sits BETWEEN the company marks — first
 * default, show mark, then the remaining defaults (typically 46 → show → Peachtree), so the
 * company branding brackets the show identity.
 *
 * Empty defaults are dropped before the show mark is placed, so a blank slot in the configured
 * defaults can't push the show mark out of the middle position.
 */
export function effectiveLogos(eventLogo: Logo | null, defaults: readonly Logo[]): Logo[] {
  const present = defaults.filter(hasLogo);
  if (!hasLogo(eventLogo)) return present.slice(0, 3);
  return [...present.slice(0, 1), eventLogo, ...present.slice(1)].slice(0, 3);
}
