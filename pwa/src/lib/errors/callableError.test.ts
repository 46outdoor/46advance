import { describe, expect, it } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { describeCallableError } from './callableError';

describe('describeCallableError', () => {
  it('surfaces a callable HttpsError message verbatim', () => {
    const err = new FirebaseError('functions/failed-precondition', 'Connect your Google account first.');
    expect(describeCallableError(err)).toBe('Connect your Google account first.');
  });

  it('gives a friendly, actionable line for rate limiting', () => {
    const err = new FirebaseError('functions/resource-exhausted', 'rate limit exceeded');
    expect(describeCallableError(err)).toBe('Too many requests just now — wait a moment and try again.');
  });

  it('falls back when the server sent no message (bare status word)', () => {
    const err = new FirebaseError('functions/internal', 'internal');
    expect(describeCallableError(err, 'Could not import.')).toBe('Could not import.');
  });

  it('passes through a plain Error message (e.g. the Picker)', () => {
    expect(describeCallableError(new Error('Drive Picker is not configured.'))).toBe(
      'Drive Picker is not configured.',
    );
  });

  it('uses the fallback for non-error values and empty messages', () => {
    expect(describeCallableError(null, 'nope')).toBe('nope');
    expect(describeCallableError(new Error('  '), 'nope')).toBe('nope');
  });

  it('defaults to a generic fallback when none is supplied', () => {
    expect(describeCallableError('unexpected')).toBe('Something went wrong. Please try again.');
  });
});
