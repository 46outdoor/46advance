/**
 * Day-aware lineup helpers over advances. The lineup IS the advances: each advance
 * carries its stage (via the subcollection it lives in) plus `slot` and
 * `performanceDate`, and `{artist N}` placeholders resolve against them. Day identity
 * uses the advance's local calendar date (`dateInputValue` round-trip — performance
 * dates are stored as local-midnight instants, see lib/dates/parsing.ts), which is the
 * same convention the advance form's day dropdown uses and matches schedule-day keys
 * for same-timezone teams.
 */
import { zonedDayKey } from '@/lib/dates/timezone';
import type { Advance } from './advance';

/** An advance located on its stage (the subcollection parent). */
export interface StageAdvanceRef {
  stageId: string;
  advance: Pick<Advance, 'artistName' | 'slot' | 'performanceDate'>;
}

/** The advance's day key ('YYYY-MM-DD') in the event's timezone, or '' when it has no performance
 *  day. Zone-aware so it matches the schedule day keys regardless of the viewer's browser zone. */
export function performanceDayKey(advance: Pick<Advance, 'performanceDate'>, timeZone: string): string {
  return zonedDayKey(advance.performanceDate, timeZone);
}

export interface SlotArtistLookup {
  /** Artist holding `slot` on `stageId` for the day: an advance dated to that day
   * wins; an undated advance is a stage-wide fallback; null when unbooked. */
  resolve(dayKey: string, stageId: string, slot: number): string | null;
}

/** Build the day-aware `{artist N}` lookup from an event's advances. */
export function buildSlotArtistLookup(
  advances: readonly StageAdvanceRef[],
  timeZone: string,
): SlotArtistLookup {
  const dated = new Map<string, string>();
  const undated = new Map<string, string>();
  for (const { stageId, advance } of advances) {
    if (advance.slot == null || !advance.artistName) continue;
    const dayKey = performanceDayKey(advance, timeZone);
    if (dayKey) dated.set(`${stageId}:${advance.slot}:${dayKey}`, advance.artistName);
    else undated.set(`${stageId}:${advance.slot}`, advance.artistName);
  }
  return {
    resolve: (dayKey, stageId, slot) =>
      dated.get(`${stageId}:${slot}:${dayKey}`) ?? undated.get(`${stageId}:${slot}`) ?? null,
  };
}

/** Where a lineup booking for `name` should land on `stageId`: an existing advance
 * with the same artist name (case/whitespace-insensitive) dated to the SAME day is
 * re-slotted; failing that, an undated one is adopted into the day. A same-name
 * advance dated to a different day is a separate performance and is never reused —
 * callers create a fresh advance when this returns null. */
export function findBookingTarget<T extends StageAdvanceRef>(
  advances: readonly T[],
  stageId: string,
  dayKey: string,
  name: string,
  timeZone: string,
): T | null {
  const wanted = name.trim().toLowerCase();
  const candidates = advances.filter(
    (a) => a.stageId === stageId && a.advance.artistName.trim().toLowerCase() === wanted,
  );
  return (
    candidates.find((a) => performanceDayKey(a.advance, timeZone) === dayKey) ??
    candidates.find((a) => !performanceDayKey(a.advance, timeZone)) ??
    null
  );
}

/** True when the advance carries entered work beyond its lineup identity (artist name,
 * slot, performance day): summary text, an advance call, a started section, or content
 * values. Subcollections (linked Drive files) aren't visible on the doc and don't
 * count — callers deciding whether a delete is safe should treat this as "no FORM data". */
export function advanceHasData(advance: Advance): boolean {
  if (
    advance.notes ||
    advance.additions ||
    advance.concerns ||
    advance.pending ||
    advance.advanceCallAt ||
    advance.advanceCallLink
  ) {
    return true;
  }
  if (Object.values(advance.sections).some((s) => s.status !== 'not_started')) return true;
  return Object.values(advance.content).some((section) =>
    Object.values(section).some((v) => v !== null && v !== '' && v !== false),
  );
}

/** Short human summary of the data `advanceHasData` found ("2 sections started ·
 * notes · an advance call") — the body of the lineup's displace warning. */
export function advanceDataSummary(advance: Advance): string {
  const parts: string[] = [];
  const started = Object.values(advance.sections).filter((s) => s.status !== 'not_started').length;
  if (started) parts.push(`${started} section${started === 1 ? '' : 's'} started`);
  const filled = Object.values(advance.content).filter((section) =>
    Object.values(section).some((v) => v !== null && v !== '' && v !== false),
  ).length;
  if (filled) parts.push(`content in ${filled} department${filled === 1 ? '' : 's'}`);
  if (advance.notes) parts.push('notes');
  if (advance.additions) parts.push('additions');
  if (advance.concerns) parts.push('concerns');
  if (advance.pending) parts.push('pending items');
  if (advance.advanceCallAt || advance.advanceCallLink) parts.push('an advance call');
  return parts.join(' · ');
}
