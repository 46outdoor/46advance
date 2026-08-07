import { describe, expect, it } from 'vitest';
import { resolveArtistPlaceholders, slotLabel, type SlotResolver } from './placeholders';

describe('slotLabel', () => {
  it('names the canonical lineup slots', () => {
    expect(slotLabel(1)).toBe('Headliner');
    expect(slotLabel(2)).toBe('Direct Support');
    expect(slotLabel(3)).toBe('Artist 3');
    expect(slotLabel(7)).toBe('Artist 7');
  });
});

describe('resolveArtistPlaceholders', () => {
  // Stage 0 (main): slot 1 booked; stage 1 ('b'): slot 2 booked.
  const resolve: SlotResolver = (stageIndex, slot) => {
    if (stageIndex === 0 && slot === 1) return 'Ashley McBryde';
    if (stageIndex === 1 && slot === 2) return 'Side Act';
    return null;
  };

  it('resolves {artist_N} against the FIRST stage', () => {
    expect(resolveArtistPlaceholders('{artist_1} — Truck Dump', resolve)).toBe(
      'Ashley McBryde — Truck Dump',
    );
  });

  it('resolves the legacy space form {artist N}', () => {
    expect(resolveArtistPlaceholders('{artist 1} set', resolve)).toBe('Ashley McBryde set');
  });

  it('routes lettered placeholders to their stage by order, not the row stage', () => {
    expect(resolveArtistPlaceholders('{artist_b_2}', resolve)).toBe('Side Act');
    expect(resolveArtistPlaceholders('{artist b 2}', resolve)).toBe('Side Act');
  });

  it('is case-insensitive', () => {
    expect(resolveArtistPlaceholders('{Artist_B_2}', resolve)).toBe('Side Act');
  });

  it('falls back to the slot label for unbooked slots (null or empty)', () => {
    expect(resolveArtistPlaceholders('{artist_2}', resolve)).toBe('Direct Support');
    expect(resolveArtistPlaceholders('{artist_b_1}', resolve)).toBe('Headliner');
    expect(resolveArtistPlaceholders('{artist_3}', () => '')).toBe('Artist 3');
  });

  it('falls back to the slot label for a stage index beyond the lineup', () => {
    expect(resolveArtistPlaceholders('{artist_c_1}', resolve)).toBe('Headliner');
  });

  it('replaces every placeholder in mixed text and leaves other text alone', () => {
    expect(resolveArtistPlaceholders('{artist_1} then {artist_b_2}; loadout', resolve)).toBe(
      'Ashley McBryde then Side Act; loadout',
    );
    expect(resolveArtistPlaceholders('No placeholders here', resolve)).toBe(
      'No placeholders here',
    );
  });
});
