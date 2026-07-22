/**
 * Idempotent Google Calendar event insertion (WS-H). A bare `events.insert` mints a new event
 * every time it runs, so a lost-response retry double-creates. Supplying a DETERMINISTIC event id
 * (derived from stable inputs) makes the insert idempotent: on retry Google returns 409 ("already
 * exists") for the same id instead of a second event, and we fetch-and-return the existing one.
 */
import { createHash } from 'node:crypto';
import { type calendar_v3 } from 'googleapis';
import { googleErrorStatus, withGoogleRetry } from './retry.js';

/**
 * A deterministic, VALID Google Calendar event id for `seed`. Calendar event ids must be base32hex
 * (chars `0-9a-v`, length 5–1024); a SHA-256 hex digest (`0-9a-f`, 64 chars) satisfies that. Same
 * seed → same id, so an insert can be retried without duplicating (see `insertCalendarEventIdempotent`).
 */
export function deterministicCalendarEventId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

/**
 * Insert a calendar event idempotently. `params.requestBody.id` MUST be set (use
 * `deterministicCalendarEventId`). Transient failures are retried; a 409 means a prior attempt
 * already created this exact id, so we fetch and return that event rather than erroring or
 * duplicating. Returns the event resource.
 */
export async function insertCalendarEventIdempotent(
  calendar: calendar_v3.Calendar,
  params: calendar_v3.Params$Resource$Events$Insert,
): Promise<calendar_v3.Schema$Event> {
  const calendarId = params.calendarId ?? undefined;
  const eventId = params.requestBody?.id ?? undefined;
  try {
    return (await withGoogleRetry(() => calendar.events.insert(params), { label: 'events.insert' })).data;
  } catch (e) {
    if (googleErrorStatus(e) === 409 && calendarId && eventId) {
      // The event we asked for already exists (a retry after an unobserved success) — adopt it.
      const got = await withGoogleRetry(() => calendar.events.get({ calendarId, eventId }), { label: 'events.get' });
      return got.data;
    }
    throw e;
  }
}
