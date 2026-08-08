/**
 * Event lineup loading + day-aware `{artist_N}` slot lookup, shared by the calendar push
 * (`googleSchedule.ts`, one day per call) and the calendar subscription feed (every day of
 * every event — planning/archive/feature/CALENDAR_SUBSCRIPTIONS.md). Loads an event's ordered stages and
 * ALL their advances ONCE, then answers per-day resolver queries from in-memory maps —
 * the feed must not repeat the old per-day/per-stage reads across a whole history.
 *
 * Mirrors the client's `buildSlotArtistLookup` (`pwa/src/lib/advances/lineup.ts`): an
 * advance whose performance day — in the event's timezone — IS the queried day wins its
 * slot; an undated advance is a stage-wide fallback; an advance dated to a DIFFERENT day
 * doesn't resolve for it.
 */
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { zonedDayKey } from '../dates/zonedTime.js';
import type { SlotResolver } from './placeholders.js';

/** One advance's lineup-relevant slice, located on its stage. */
export interface LineupAdvanceRow {
  stageId: string;
  slot: number;
  artistName: string;
  /** The performance day key ('YYYY-MM-DD' in the event's timezone), or '' when undated. */
  dayKey: string;
}

export interface EventLineup {
  /** Stage ids by lineup order (lowest `order`, then name — matches the client's
   * listStages sort). Placeholder letters index into this: [0] = main, [1] = 'b'. */
  stageOrder: readonly string[];
  /** Stage display names by id (feed rendering; '' when unnamed). */
  stageNames: ReadonlyMap<string, string>;
  /** Day-aware placeholder resolver: (stageIndex, slot) → artist for `dayKey`, or null
   * when unbooked. Pass the result straight to `resolveArtistPlaceholders`. */
  resolverForDay(dayKey: string): SlotResolver;
}

/** Build the day-aware lookup from plain rows (pure — the testable core). */
export function buildLineup(
  stages: readonly { id: string; name: string }[],
  advances: readonly LineupAdvanceRow[],
): EventLineup {
  const stageOrder = stages.map((s) => s.id);
  const stageNames = new Map(stages.map((s) => [s.id, s.name]));
  const dated = new Map<string, string>();
  const undated = new Map<string, string>();
  for (const a of advances) {
    if (a.dayKey) dated.set(`${a.stageId}:${a.slot}:${a.dayKey}`, a.artistName);
    else undated.set(`${a.stageId}:${a.slot}`, a.artistName);
  }
  return {
    stageOrder,
    stageNames,
    resolverForDay: (dayKey) => (stageIndex, slot) => {
      const stageId = stageOrder[stageIndex];
      if (!stageId) return null;
      return (
        dated.get(`${stageId}:${slot}:${dayKey}`) ?? undated.get(`${stageId}:${slot}`) ?? null
      );
    },
  };
}

/** The advance's performance day key in `timeZone`, or '' when undated/malformed. */
function performanceDayKey(advance: DocumentData, timeZone: string): string {
  const at: unknown = advance.performanceDate;
  return at && typeof (at as { toDate?: unknown }).toDate === 'function'
    ? zonedDayKey((at as { toDate: () => Date }).toDate(), timeZone)
    : '';
}

/**
 * Load an event's ordered stages + all advances once and build the lineup lookup.
 * One `stages` read + one `advances` read per stage, regardless of how many days the
 * caller resolves afterwards.
 */
export async function loadEventLineup(
  db: Firestore,
  eventId: string,
  timeZone: string,
): Promise<EventLineup> {
  const stageSnap = await db.collection(`events/${eventId}/stages`).get();
  const stages = stageSnap.docs
    .map((d) => ({
      id: d.id,
      order: typeof d.data().order === 'number' ? (d.data().order as number) : 0,
      name: String(d.data().name ?? ''),
    }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const rows: LineupAdvanceRow[] = [];
  await Promise.all(
    stages.map(async (stage) => {
      const snap = await db.collection(`events/${eventId}/stages/${stage.id}/advances`).get();
      for (const doc of snap.docs) {
        const a = doc.data();
        if (typeof a.slot !== 'number' || typeof a.artistName !== 'string' || !a.artistName)
          continue;
        rows.push({
          stageId: stage.id,
          slot: a.slot,
          artistName: a.artistName,
          dayKey: performanceDayKey(a, timeZone),
        });
      }
    }),
  );
  return buildLineup(stages, rows);
}
