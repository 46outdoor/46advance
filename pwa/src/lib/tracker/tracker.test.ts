import { describe, expect, it } from 'vitest';
import type { Advance } from '@/lib/advances/advance';
import type { SectionStatus } from '@/lib/advances/sections';
import {
  completionPct,
  rollUpEvent,
  sumCounts,
  type LocatedAdvance,
  type TrackerColumn,
} from './tracker';

const COLUMNS: TrackerColumn[] = [
  { id: 'audio', name: 'Audio' },
  { id: 'lighting', name: 'Lighting' },
];

function advance(id: string, artistName: string, statuses: Record<string, SectionStatus>): Advance {
  return {
    id,
    artistName,
    performanceDate: null,
    stage: null,
    notes: null,
    additions: null,
    concerns: null,
    pending: null,
    sections: Object.fromEntries(
      Object.entries(statuses).map(([k, status]) => [k, { status, finalizedAt: null, finalizedBy: null }]),
    ),
    content: {},
    createdBy: 'u1',
    createdAt: null,
    updatedAt: null,
  };
}

function located(stageId: string, stageName: string, adv: Advance): LocatedAdvance {
  return { stageId, stageName, advance: adv };
}

describe('sumCounts', () => {
  it('adds counts field-wise', () => {
    const total = sumCounts([
      { not_started: 1, in_progress: 2, complete: 3, total: 6 },
      { not_started: 0, in_progress: 1, complete: 1, total: 2 },
    ]);
    expect(total).toEqual({ not_started: 1, in_progress: 3, complete: 4, total: 8 });
  });

  it('returns zeroes for an empty list', () => {
    expect(sumCounts([])).toEqual({ not_started: 0, in_progress: 0, complete: 0, total: 0 });
  });
});

describe('completionPct', () => {
  it('is complete / total', () => {
    expect(completionPct({ not_started: 1, in_progress: 1, complete: 2, total: 4 })).toBe(0.5);
  });

  it('is 0 (not NaN) when nothing is counted', () => {
    expect(completionPct({ not_started: 0, in_progress: 0, complete: 0, total: 0 })).toBe(0);
  });
});

describe('rollUpEvent', () => {
  it('builds cells per column and counts statuses', () => {
    const tracker = rollUpEvent(
      [located('s1', 'Main', advance('a1', 'Alpha', { audio: 'complete', lighting: 'in_progress' }))],
      COLUMNS,
    );
    expect(tracker.columns).toHaveLength(2);
    expect(tracker.rows).toHaveLength(1);
    expect(tracker.rows[0].cells).toEqual({ audio: 'complete', lighting: 'in_progress' });
    expect(tracker.rows[0].counts).toEqual({ not_started: 0, in_progress: 1, complete: 1, total: 2 });
    expect(tracker.summary).toEqual({ not_started: 0, in_progress: 1, complete: 1, total: 2 });
  });

  it('marks a missing section cell null and excludes it from counts', () => {
    const tracker = rollUpEvent(
      [located('s1', 'Main', advance('a1', 'Alpha', { audio: 'complete' }))],
      COLUMNS,
    );
    expect(tracker.rows[0].cells.lighting).toBeNull();
    expect(tracker.rows[0].counts.total).toBe(1);
  });

  it('orders rows by stage then artist', () => {
    const tracker = rollUpEvent(
      [
        located('s2', 'South', advance('a3', 'Zed', { audio: 'not_started' })),
        located('s1', 'North', advance('a2', 'Beta', { audio: 'not_started' })),
        located('s1', 'North', advance('a1', 'Alpha', { audio: 'not_started' })),
      ],
      COLUMNS,
    );
    expect(tracker.rows.map((r) => r.artistName)).toEqual(['Alpha', 'Beta', 'Zed']);
  });

  it('aggregates summary across all rows', () => {
    const tracker = rollUpEvent(
      [
        located('s1', 'Main', advance('a1', 'Alpha', { audio: 'complete', lighting: 'complete' })),
        located('s1', 'Main', advance('a2', 'Beta', { audio: 'not_started', lighting: 'in_progress' })),
      ],
      COLUMNS,
    );
    expect(tracker.summary).toEqual({ not_started: 1, in_progress: 1, complete: 2, total: 4 });
    expect(completionPct(tracker.summary)).toBe(0.5);
  });
});
