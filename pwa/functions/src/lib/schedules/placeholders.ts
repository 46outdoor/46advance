/**
 * Artist-placeholder resolution shared by the calendar push (`googleSchedule.ts`) and the
 * calendar subscription feed (planning/CALENDAR_SUBSCRIPTIONS.md). Pure — the server mirror
 * of the client's `resolveArtistPlaceholders` in `pwa/src/lib/schedules/scheduleDay.ts`
 * (separate toolchains, no shared package yet — keep the two in lockstep).
 *
 * A placeholder names its lineup stage by ORDER: `{artist_N}` (or legacy `{artist N}`) is
 * slot N on the first (main) stage, `{artist_b_N}` the second, `{artist_c_N}` the third…
 * — never the row's own stage. Unbooked slots render the canonical slot label.
 */

const ARTIST_PLACEHOLDER_RE = /\{artist(?:[\s_]+([a-z]))?[\s_]+(\d+)\}/gi;

/** Maps (stageIndex, slot) to the artist holding that slot — stageIndex 0 = the
 * first/main stage, 1 = 'b', … — or null/'' when unbooked. */
export type SlotResolver = (stageIndex: number, slot: number) => string | null;

/** Canonical lineup slot label (mirrors the client's slotLabel). */
export function slotLabel(slot: number): string {
  if (slot === 1) return 'Headliner';
  if (slot === 2) return 'Direct Support';
  return `Artist ${slot}`;
}

/** Replace artist placeholders in item text. Unbooked slots (resolve → null/'')
 * render the slot label instead. */
export function resolveArtistPlaceholders(text: string, resolve: SlotResolver): string {
  return text.replace(ARTIST_PLACEHOLDER_RE, (_m, letter: string | undefined, n: string) => {
    const stageIndex = letter ? letter.toLowerCase().charCodeAt(0) - 97 : 0;
    return resolve(stageIndex, Number(n)) || slotLabel(Number(n));
  });
}
