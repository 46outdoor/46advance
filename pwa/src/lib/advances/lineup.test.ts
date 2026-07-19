import { describe, expect, it } from 'vitest';
import type { Advance } from './advance';
import {
  advanceDataSummary,
  advanceHasData,
  buildSlotArtistLookup,
  performanceDayKey,
} from './lineup';

const advance = (over: Partial<Advance> = {}): Advance => ({
  id: 'a1',
  artistName: 'Staind',
  performanceDate: null,
  slot: 1,
  notes: null,
  additions: null,
  concerns: null,
  pending: null,
  advanceCallAt: null,
  advanceCallLink: null,
  googleCalendarEventId: null,
  sections: {},
  content: {},
  createdBy: 'u1',
  createdAt: null,
  updatedAt: null,
  ...over,
});

describe('performanceDayKey', () => {
  it('formats the local calendar date', () => {
    expect(performanceDayKey({ performanceDate: new Date(2026, 5, 28) })).toBe('2026-06-28');
  });

  it('is empty for undated advances', () => {
    expect(performanceDayKey({ performanceDate: null })).toBe('');
  });
});

describe('buildSlotArtistLookup', () => {
  it('resolves a dated advance only on its day', () => {
    const lookup = buildSlotArtistLookup([
      { stageId: 'main', advance: advance({ performanceDate: new Date(2026, 5, 27), artistName: 'Kid Rock' }) },
      { stageId: 'main', advance: advance({ performanceDate: new Date(2026, 5, 28), artistName: 'Staind' }) },
    ]);
    expect(lookup.resolve('2026-06-27', 'main', 1)).toBe('Kid Rock');
    expect(lookup.resolve('2026-06-28', 'main', 1)).toBe('Staind');
    expect(lookup.resolve('2026-06-29', 'main', 1)).toBeNull();
  });

  it('falls back to an undated advance for any day, with dated matches winning', () => {
    const lookup = buildSlotArtistLookup([
      { stageId: 'main', advance: advance({ artistName: 'House DJ' }) },
      { stageId: 'main', advance: advance({ performanceDate: new Date(2026, 5, 28), artistName: 'Staind' }) },
    ]);
    expect(lookup.resolve('2026-06-27', 'main', 1)).toBe('House DJ');
    expect(lookup.resolve('2026-06-28', 'main', 1)).toBe('Staind');
  });

  it('scopes slots per stage and ignores slotless advances', () => {
    const lookup = buildSlotArtistLookup([
      { stageId: 'main', advance: advance({ artistName: 'Staind' }) },
      { stageId: 'rowdy', advance: advance({ artistName: 'Atlus' }) },
      { stageId: 'main', advance: advance({ slot: null, artistName: 'Unbooked' }) },
    ]);
    expect(lookup.resolve('', 'main', 1)).toBe('Staind');
    expect(lookup.resolve('', 'rowdy', 1)).toBe('Atlus');
    expect(lookup.resolve('', 'main', 2)).toBeNull();
  });
});

describe('advanceHasData', () => {
  it('is false for a lineup-only shell', () => {
    expect(advanceHasData(advance())).toBe(false);
  });

  it('is true for summary text, calls, and started sections', () => {
    expect(advanceHasData(advance({ notes: 'runner needed' }))).toBe(true);
    expect(advanceHasData(advance({ advanceCallAt: new Date() }))).toBe(true);
    expect(
      advanceHasData(
        advance({ sections: { audio: { status: 'in_progress', finalizedAt: null, finalizedBy: null } } }),
      ),
    ).toBe(true);
  });

  it('counts content only when a value is actually filled', () => {
    expect(advanceHasData(advance({ content: { audio: { foh_console: '' } } }))).toBe(false);
    expect(advanceHasData(advance({ content: { audio: { need_lighting: false } } }))).toBe(false);
    expect(advanceHasData(advance({ content: { audio: { foh_console: 'SD10' } } }))).toBe(true);
  });
});

describe('advanceDataSummary', () => {
  it('lists what was entered', () => {
    const summary = advanceDataSummary(
      advance({
        notes: 'x',
        sections: {
          audio: { status: 'in_progress', finalizedAt: null, finalizedBy: null },
          video: { status: 'complete', finalizedAt: null, finalizedBy: null },
        },
        content: { audio: { foh_console: 'SD10' } },
        advanceCallLink: 'https://meet.google.com/x',
      }),
    );
    expect(summary).toBe('2 sections started · content in 1 department · notes · an advance call');
  });
});
