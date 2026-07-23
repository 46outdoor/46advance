import { FirebaseError } from 'firebase/app';

const GENERIC_FALLBACK = 'Something went wrong. Please try again.';

/**
 * Turn an unknown thrown value into a concise, user-safe message.
 *
 * Cloud Functions callables throw `HttpsError` with deliberate, user-facing messages
 * (e.g. "Connect your Google account first.", "This event has no linked Drive folder.")
 * — so we surface those rather than a one-size-fits-all string. Two exceptions:
 *  - `resource-exhausted` (rate limited) gets a friendlier, actionable line.
 *  - opaque/redacted errors — an `internal` with no server message (Firebase then uses the
 *    bare status word as the message) — fall back, since the raw word isn't useful to a person.
 *
 * Plain `Error`s (e.g. the Google Picker's "Drive Picker is not configured.") pass their
 * message through. Anything else returns the fallback.
 */
export function describeCallableError(err: unknown, fallback: string = GENERIC_FALLBACK): string {
  if (err instanceof FirebaseError) {
    if (err.code === 'functions/resource-exhausted') {
      return 'Too many requests just now — wait a moment and try again.';
    }
    const message = err.message?.trim();
    // Firebase sets `message` to the bare status word (e.g. "internal") when the server
    // sent none — treat that as no message.
    const codeWord = err.code.startsWith('functions/') ? err.code.slice('functions/'.length) : '';
    if (message && message.toLowerCase() !== codeWord && message.toLowerCase() !== 'internal') {
      return message;
    }
    return fallback;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  return fallback;
}
