/**
 * Advance tracker read-model (ROADMAP §8). Pure aggregation over advance sections —
 * no Firestore IO here (that's tracker-service.ts). A tracker is a read-only roll-up
 * colored by per-section status (not_started → in_progress → complete); red stays brand.
 */
import { sectionStateFor, type SectionStatus } from '@/lib/advances/sections';
import type { Advance } from '@/lib/advances/advance';

/** Count of sections in each status, plus the total counted. */
export interface StatusCounts {
  not_started: number;
  in_progress: number;
  complete: number;
  total: number;
}

/** One row of the per-event grid: an advance + its status per department column. */
export interface AdvanceRow {
  stageId: string;
  stageName: string;
  advanceId: string;
  artistName: string;
  performanceDate: Date | null;
  /** Status per department column. A department with no section yet counts as not_started
   *  (matching the advance detail screen), so every current column is represented. */
  cells: Record<string, SectionStatus>;
  counts: StatusCounts;
}

/** Column descriptor for the grid (a department). */
export interface TrackerColumn {
  id: string;
  name: string;
}

/** The full per-event grid model. */
export interface EventTracker {
  columns: TrackerColumn[];
  rows: AdvanceRow[];
  summary: StatusCounts;
}

/** A single advance located within its stage (input to the roll-up). */
export interface LocatedAdvance {
  stageId: string;
  stageName: string;
  advance: Advance;
}

const emptyCounts = (): StatusCounts => ({ not_started: 0, in_progress: 0, complete: 0, total: 0 });

/** Sum a list of counts into one. */
export function sumCounts(counts: readonly StatusCounts[]): StatusCounts {
  return counts.reduce<StatusCounts>((acc, c) => {
    acc.not_started += c.not_started;
    acc.in_progress += c.in_progress;
    acc.complete += c.complete;
    acc.total += c.total;
    return acc;
  }, emptyCounts());
}

/**
 * Completion fraction in [0, 1]: complete sections / total. 0 when nothing is counted
 * (an event with no advances reads as 0% rather than NaN).
 */
export function completionPct(counts: StatusCounts): number {
  return counts.total === 0 ? 0 : counts.complete / counts.total;
}

/**
 * Build one grid row from a located advance over the given department columns. Every current
 * column is counted: a department with no section yet on this advance (e.g. enabled after the
 * advance was created) counts as not_started via `sectionStateFor`, so the row's denominator is
 * the current department count — the same rule the advance detail screen uses.
 */
function buildRow(located: LocatedAdvance, columnIds: readonly string[]): AdvanceRow {
  const { stageId, stageName, advance } = located;
  const cells: Record<string, SectionStatus> = {};
  const counts = emptyCounts();
  for (const deptId of columnIds) {
    const status = sectionStateFor(advance.sections, deptId).status;
    cells[deptId] = status;
    counts[status] += 1;
    counts.total += 1;
  }
  return {
    stageId,
    stageName,
    advanceId: advance.id,
    artistName: advance.artistName,
    performanceDate: advance.performanceDate,
    cells,
    counts,
  };
}

/**
 * Roll a set of located advances into the per-event grid model. Columns come from the
 * event's enabled departments (id + display name); rows are ordered by stage then artist.
 * Pure — callers supply already-fetched data.
 */
export function rollUpEvent(
  located: readonly LocatedAdvance[],
  columns: readonly TrackerColumn[],
): EventTracker {
  const columnIds = columns.map((c) => c.id);
  const rows = located
    .map((l) => buildRow(l, columnIds))
    .sort(
      (a, b) =>
        a.stageName.localeCompare(b.stageName) || a.artistName.localeCompare(b.artistName),
    );
  return {
    columns: [...columns],
    rows,
    summary: sumCounts(rows.map((r) => r.counts)),
  };
}
