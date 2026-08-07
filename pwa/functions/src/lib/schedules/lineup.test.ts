import { describe, expect, it } from 'vitest';
import { buildLineup } from './lineup';

const STAGES = [
  { id: 'main', name: 'Main Stage' },
  { id: 'side', name: 'Side Stage' },
];

describe('buildLineup', () => {
  it('exposes stage order and names', () => {
    const lineup = buildLineup(STAGES, []);
    expect(lineup.stageOrder).toEqual(['main', 'side']);
    expect(lineup.stageNames.get('main')).toBe('Main Stage');
    expect(lineup.stageNames.get('side')).toBe('Side Stage');
  });

  it('resolves a dated advance only on its performance day', () => {
    const lineup = buildLineup(STAGES, [
      { stageId: 'main', slot: 1, artistName: 'Dated Act', dayKey: '2026-08-15' },
    ]);
    expect(lineup.resolverForDay('2026-08-15')(0, 1)).toBe('Dated Act');
    expect(lineup.resolverForDay('2026-08-16')(0, 1)).toBeNull();
  });

  it('uses an undated advance as the stage-wide fallback, losing to a dated one on its day', () => {
    const lineup = buildLineup(STAGES, [
      { stageId: 'main', slot: 1, artistName: 'Undated Act', dayKey: '' },
      { stageId: 'main', slot: 1, artistName: 'Dated Act', dayKey: '2026-08-15' },
    ]);
    expect(lineup.resolverForDay('2026-08-15')(0, 1)).toBe('Dated Act');
    expect(lineup.resolverForDay('2026-08-16')(0, 1)).toBe('Undated Act');
  });

  it('keys slots per stage: index 1 reads the second stage, never the first', () => {
    const lineup = buildLineup(STAGES, [
      { stageId: 'main', slot: 2, artistName: 'Main Slot 2', dayKey: '' },
      { stageId: 'side', slot: 2, artistName: 'Side Slot 2', dayKey: '' },
    ]);
    const resolve = lineup.resolverForDay('2026-08-15');
    expect(resolve(0, 2)).toBe('Main Slot 2');
    expect(resolve(1, 2)).toBe('Side Slot 2');
  });

  it('returns null for a stage index beyond the lineup and for unbooked slots', () => {
    const lineup = buildLineup(STAGES, [
      { stageId: 'main', slot: 1, artistName: 'Act', dayKey: '' },
    ]);
    const resolve = lineup.resolverForDay('2026-08-15');
    expect(resolve(2, 1)).toBeNull();
    expect(resolve(0, 4)).toBeNull();
  });
});
