import { describe, expect, it } from 'vitest';
import { resolveDisplayName } from './displayName';

describe('resolveDisplayName', () => {
  it('keeps an existing name (does not clobber on re-sync)', () => {
    expect(resolveDisplayName('Jared Miller', null, null)).toBe('Jared Miller');
    // existing wins even when a token/contact name is present
    expect(resolveDisplayName('Jared Miller', 'Token Name', 'Contact Name')).toBe('Jared Miller');
  });

  it('falls back to the token name when there is no existing name', () => {
    expect(resolveDisplayName(null, 'Google Name', null)).toBe('Google Name');
    expect(resolveDisplayName('   ', 'Google Name', null)).toBe('Google Name');
  });

  it('falls back to the pre-added contact name when no existing/token name', () => {
    expect(resolveDisplayName(null, null, 'Pre-added Person')).toBe('Pre-added Person');
    expect(resolveDisplayName(null, '  ', 'Pre-added Person')).toBe('Pre-added Person');
  });

  it('returns null when nothing usable is available', () => {
    expect(resolveDisplayName(null, null, null)).toBeNull();
    expect(resolveDisplayName('', '   ', '')).toBeNull();
    expect(resolveDisplayName(42, {}, null)).toBeNull();
  });
});
