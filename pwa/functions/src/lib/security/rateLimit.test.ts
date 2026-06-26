import { afterEach, describe, expect, it, vi } from 'vitest';
// No extension specifier: excluded from the nodenext tsc build; Vitest resolves the .ts.
import { checkRateLimit, makeRateLimitKey } from './rateLimit';

describe('makeRateLimitKey', () => {
  it('joins non-empty parts with a colon', () => {
    expect(makeRateLimitKey(['generatePacket', 'uid-1'])).toBe('generatePacket:uid-1');
  });

  it('drops null/undefined/blank parts', () => {
    expect(makeRateLimitKey(['fn', null, undefined, '', '   ', 'uid'])).toBe('fn:uid');
  });

  it('returns an empty string when nothing remains', () => {
    expect(makeRateLimitKey([null, '', '  '])).toBe('');
  });
});

describe('checkRateLimit (in-memory)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to the limit, then blocks within the window', () => {
    const key = 'mem-block'; // unique per test — the module keeps a process-wide Map
    expect(checkRateLimit(key, 2, 60_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(checkRateLimit(key, 2, 60_000)).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = checkRateLimit(key, 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('resets once the window elapses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const key = 'mem-reset';
    expect(checkRateLimit(key, 1, 1_000).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 1_000).allowed).toBe(false); // limit of 1 hit
    vi.advanceTimersByTime(1_001);
    expect(checkRateLimit(key, 1, 1_000).allowed).toBe(true); // fresh window
  });
});
