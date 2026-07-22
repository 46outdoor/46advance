import { describe, expect, it } from 'vitest';
import type { Advance } from './advance';
import {
  advanceDataSummary,
  advanceHasData,
  buildSlotArtistLookup,
  findBookingTarget,
  performanceDayKey,
} from './lineup';
import { dayKeyToInstant } from '@/lib/dates/timezone';

// A non-Central event zone proves day keys derive from the EVENT zone, not the test runner's.
const TZ = 'America/Los_Angeles';
const on = (dayKey: string): Date | null => dayKeyToInstant(dayKey, TZ);

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
  it('formats the performance date as its day key in the event zone', () => {
    expect(performanceDayKey({ performanceDate: on('2026-06-28') }, TZ)).toBe('2026-06-28');
  });

  it('is empty for undated advances', () => {
    expect(performanceDayKey({ performanceDate: null }, TZ)).toBe('');
  });
});

describe('buildSlotArtistLookup', () => {
  it('resolves a dated advance only on its day', () => {
    const lookup = buildSlotArtistLookup(
      [
        { stageId: 'main', advance: advance({ performanceDate: on('2026-06-27'), artistName: 'Kid Rock' }) },
        { stageId: 'main', advance: advance({ performanceDate: on('2026-06-28'), artistName: 'Staind' }) },
      ],
      TZ,
    );
    expect(lookup.resolve('2026-06-27', 'main', 1)).toBe('Kid Rock');
    expect(lookup.resolve('2026-06-28', 'main', 1)).toBe('Staind');
    expect(lookup.resolve('2026-06-29', 'main', 1)).toBeNull();
  });

  it('falls back to an undated advance for any day, with dated matches winning', () => {
    const lookup = buildSlotArtistLookup(
      [
        { stageId: 'main', advance: advance({ artistName: 'House DJ' }) },
        { stageId: 'main', advance: advance({ performanceDate: on('2026-06-28'), artistName: 'Staind' }) },
      ],
      TZ,
    );
    expect(lookup.resolve('2026-06-27', 'main', 1)).toBe('House DJ');
    expect(lookup.resolve('2026-06-28', 'main', 1)).toBe('Staind');
  });

  it('scopes slots per stage and ignores slotless advances', () => {
    const lookup = buildSlotArtistLookup(
      [
        { stageId: 'main', advance: advance({ artistName: 'Staind' }) },
        { stageId: 'rowdy', advance: advance({ artistName: 'Atlus' }) },
        { stageId: 'main', advance: advance({ slot: null, artistName: 'Unbooked' }) },
      ],
      TZ,
    );
    expect(lookup.resolve('', 'main', 1)).toBe('Staind');
    expect(lookup.resolve('', 'rowdy', 1)).toBe('Atlus');
    expect(lookup.resolve('', 'main', 2)).toBeNull();
  });
});

describe('findBookingTarget', () => {
  const sameDay = { stageId: 'main', advance: advance({ id: 'dated', performanceDate: on('2026-06-28') }) };
  const undated = { stageId: 'main', advance: advance({ id: 'undated' }) };
  const otherDay = { stageId: 'main', advance: advance({ id: 'other', performanceDate: on('2026-06-27') }) };

  it('prefers a same-day match, then adopts an undated one', () => {
    expect(findBookingTarget([undated, sameDay], 'main', '2026-06-28', 'Staind', TZ)).toBe(sameDay);
    expect(findBookingTarget([otherDay, undated], 'main', '2026-06-28', 'Staind', TZ)).toBe(undated);
  });

  it('never reuses an advance dated to a different day or another stage', () => {
    expect(findBookingTarget([otherDay], 'main', '2026-06-28', 'Staind', TZ)).toBeNull();
    expect(findBookingTarget([{ ...sameDay, stageId: 'rowdy' }], 'main', '2026-06-28', 'Staind', TZ)).toBeNull();
  });

  it('matches names case- and whitespace-insensitively', () => {
    expect(findBookingTarget([undated], 'main', '', '  staind ', TZ)).toBe(undated);
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
