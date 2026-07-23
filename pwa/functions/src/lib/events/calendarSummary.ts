/**
 * The Google Calendar name for an event, and the decision to re-name an existing calendar. Pure
 * (type-only firebase-admin import) so both `ensureEventCalendar` (create) and the rename trigger
 * agree on the summary, and the rename decision is unit-tested.
 */
import type { DocumentData } from 'firebase-admin/firestore';

/** Calendar name: a per-event short code ("BOTB — Summerfest") when set, else the brand default. */
export function eventCalendarSummary(shortCode: unknown, eventName: string): string {
  const code = typeof shortCode === 'string' ? shortCode.trim() : '';
  return code ? `${code} — ${eventName}` : `46 Advance — ${eventName}`;
}

export interface CalendarRenamePlan {
  calendarId: string;
  /** The account that owns the calendar (only they can patch it). */
  ownerUid: string;
  summary: string;
}

/**
 * Decide whether an `events/{id}` update requires re-naming its Google calendar, and to what.
 * Returns null when nothing to do: the event has no calendar yet (create names it), the owner is
 * unknown (legacy / cleared), or neither the name nor the short code changed.
 */
export function planCalendarRename(before: DocumentData, after: DocumentData): CalendarRenamePlan | null {
  const calendarId = typeof after.googleCalendarId === 'string' ? after.googleCalendarId : '';
  if (!calendarId) return null;
  const ownerUid = typeof after.googleCalendarOwnerUid === 'string' ? after.googleCalendarOwnerUid : '';
  if (!ownerUid) return null;

  const nameChanged = before.name !== after.name;
  const codeChanged = (before.shortCode ?? null) !== (after.shortCode ?? null);
  if (!nameChanged && !codeChanged) return null;

  return { calendarId, ownerUid, summary: eventCalendarSummary(after.shortCode, String(after.name ?? 'Event')) };
}
