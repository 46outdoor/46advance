/**
 * Schedule-item → calendar-event content, shared by the Google calendar push
 * (`googleSchedule.ts`) and the subscription feed's item mode
 * (planning/CALENDAR_SUBSCRIPTIONS.md Phase 2). Both surfaces must render IDENTICAL
 * events for one item — summary/location/description text and the derived instants —
 * so the computation lives here and each caller only adapts the shape.
 *
 * Instants derive from the day's date + wall-clock times in the event's timezone; a
 * "+1" (next-day AM) item shifts one date forward, an end at or before the start rolls
 * overnight, and a missing end runs the default duration.
 */
import type { DocumentData } from 'firebase-admin/firestore';
import { shiftDayKey, zonedInputToDate } from '../dates/zonedTime.js';
import { asWallClock } from '../dates/wallClock.js';
import { resolveArtistPlaceholders, type SlotResolver } from './placeholders.js';

const DEFAULT_DURATION_MIN = 30;

/** An item belongs on the calendar when it's flagged to push and has a start time. */
export function shouldHaveEvent(item: DocumentData): boolean {
  return item.pushToCalendar !== false && asWallClock(item.startTime) !== null;
}

/** One item's calendar-event content, shape-agnostic. */
export interface ScheduleItemEvent {
  /** Resolved item text. */
  summary: string;
  location: string | null;
  /** Resolved description text, populated per-type fields (minus location), crew lines. */
  descriptionLines: string[];
  start: Date;
  end: Date;
}

/** Description lines for an item's calendar event: resolved description text, populated
 * per-type fields (minus location — it gets the event's location slot), and crew lines. */
function buildDescriptionLines(item: DocumentData, resolve: SlotResolver): string[] {
  const lines: string[] = [];
  if (typeof item.description === 'string' && item.description) {
    lines.push(resolveArtistPlaceholders(item.description, resolve));
  }
  const fields =
    item.fields && typeof item.fields === 'object' ? (item.fields as Record<string, string>) : {};
  for (const [k, v] of Object.entries(fields)) if (v && k !== 'location') lines.push(`${k}: ${v}`);
  for (const raw of Array.isArray(item.crew) ? item.crew : []) {
    const line = raw as DocumentData;
    if (typeof line?.type === 'string' && typeof line?.quantity === 'number') {
      lines.push(
        `(${line.quantity}) ${line.type}${typeof line.hours === 'number' ? ` · ${line.hours}h` : ''}`,
      );
    }
  }
  return lines;
}

/** Build one item's event content (start required — null when it has none). */
export function buildScheduleItemEvent(
  item: DocumentData,
  dateKey: string,
  timeZone: string,
  resolve: SlotResolver,
): ScheduleItemEvent | null {
  const baseKey = item.nextDay === true ? shiftDayKey(dateKey, 1) : dateKey;
  const startTime = asWallClock(item.startTime);
  const start = startTime ? zonedInputToDate(`${baseKey}T${startTime}`, timeZone) : null;
  if (!start) return null;
  const endTime = asWallClock(item.endTime);
  let end = endTime ? zonedInputToDate(`${baseKey}T${endTime}`, timeZone) : null;
  if (end && end.getTime() <= start.getTime()) {
    end = zonedInputToDate(`${shiftDayKey(baseKey, 1)}T${endTime}`, timeZone);
  }
  if (!end) end = new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);

  const fields =
    item.fields && typeof item.fields === 'object' ? (item.fields as Record<string, string>) : {};
  return {
    summary: resolveArtistPlaceholders(String(item.item ?? 'Schedule item'), resolve),
    location: typeof fields.location === 'string' && fields.location ? fields.location : null,
    descriptionLines: buildDescriptionLines(item, resolve),
    start,
    end,
  };
}
