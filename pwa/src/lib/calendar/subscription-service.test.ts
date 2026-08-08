import { describe, expect, it } from 'vitest';
import { calendarSubscriptionKey, toggleId } from './subscription-service';

describe('toggleId', () => {
  it('adds and removes without duplicating', () => {
    expect(toggleId([], 'a', true)).toEqual(['a']);
    expect(toggleId(['a'], 'a', true)).toEqual(['a']);
    expect(toggleId(['a', 'b'], 'a', false)).toEqual(['b']);
    expect(toggleId(['a'], 'missing', false)).toEqual(['a']);
  });

  it('does not mutate the input list', () => {
    const list = ['a'];
    toggleId(list, 'b', true);
    expect(list).toEqual(['a']);
  });
});

describe('calendarSubscriptionKey', () => {
  it('scopes the cache per user and has a stable anonymous key', () => {
    expect(calendarSubscriptionKey('uid-1')).toEqual(['calendarSubscription', 'uid-1']);
    expect(calendarSubscriptionKey(undefined)).toEqual(['calendarSubscription', 'anon']);
  });
});
