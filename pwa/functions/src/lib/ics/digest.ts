/**
 * VEVENT rendering for the calendar subscription feed (planning/CALENDAR_SUBSCRIPTIONS.md
 * § Rendering) in both modes: DIGEST (the default) and ITEM (opt-in, Phase 2).
 *
 * Digest: one transparent all-day VEVENT per
 * schedule day, whose description is the day at a glance — time range + resolved item
 * name + stage per row, untimed rows in a final "Untimed" section. Deliberately
 * calendar-sized and bearer-URL-safe: crew lines, arbitrary item `fields`, and freeform
 * descriptions are omitted in Phase 1.
 *
 * Pure — callers load days/lineups and pass plain inputs; timestamps are supplied, never
 * read from the clock, so an unchanged poll renders a byte-identical body.
 */
import type { DocumentData } from 'firebase-admin/firestore';
import { SCHEDULE_DAY_TYPE_LABELS } from '../../contracts/scheduleDayTypes.js';
import { shiftDayKey } from '../dates/zonedTime.js';
import { asWallClock, formatWallClockRange } from '../dates/wallClock.js';
import { resolveArtistPlaceholders, type SlotResolver } from '../schedules/placeholders.js';
import { buildScheduleItemEvent, shouldHaveEvent } from '../schedules/itemEvent.js';
import { escapeIcsText, icsDate, icsUtcStamp } from './serialize.js';

/** One digest row, resolved and ready to render. */
export interface DigestItem {
  /** Validated 'HH:mm' wall-clock start, or null = untimed. */
  startTime: string | null;
  endTime: string | null;
  /** "+1": the times are the AM after the day's date — stays on this day's digest,
   * marked, matching the day card (decision 2026-08-07). */
  nextDay: boolean;
  /** Item display name, artist placeholders already resolved. */
  name: string;
  stageName: string | null;
}

/**
 * Map a day's raw embedded items to digest rows: `pushToCalendar: false` rows are
 * excluded (the flag keeps its meaning in both modes), placeholders resolve through the
 * day's lineup resolver, and a malformed start time renders as untimed rather than
 * inventing a slot.
 */
export function digestItemsFromDay(
  items: readonly DocumentData[],
  resolve: SlotResolver,
  stageNames: ReadonlyMap<string, string>,
): DigestItem[] {
  const rows: DigestItem[] = [];
  for (const item of items) {
    if (item.pushToCalendar === false) continue;
    const name = resolveArtistPlaceholders(String(item.item ?? 'Schedule item'), resolve);
    const stageId = typeof item.stageId === 'string' ? item.stageId : '';
    rows.push({
      startTime: asWallClock(item.startTime),
      endTime: asWallClock(item.endTime),
      nextDay: item.nextDay === true,
      name,
      stageName: (stageId && stageNames.get(stageId)) || null,
    });
  }
  return rows;
}

/** Display order (mirrors the client's sortDayItems): same-day times, then "+1"
 * (next-day AM) times, untimed last; ties keep array order (stable sort). */
function sortDigestItems(items: readonly DigestItem[]): DigestItem[] {
  const key = (i: DigestItem) => (i.startTime == null ? '3' : `${i.nextDay ? 2 : 1}${i.startTime}`);
  return [...items].sort((a, b) => key(a).localeCompare(key(b)));
}

export interface DigestDayInput {
  eventId: string;
  /** 'YYYY-MM-DD' — the digest's calendar date. */
  dayKey: string;
  /** Event shortCode when set, else the event name. */
  eventLabel: string;
  /** ScheduleDay.title; null falls back to the day-type label. */
  dayTitle: string | null;
  dayType: string;
  /** Latest relevant source timestamp — drives DTSTAMP/LAST-MODIFIED deterministically. */
  updatedAt: Date;
  items: readonly DigestItem[];
}

/** 'BOTB — Show Day': event label + day title, else the day-type label. */
export function digestSummary(input: Pick<DigestDayInput, 'eventLabel' | 'dayTitle' | 'dayType'>): string {
  const dayLabel =
    input.dayTitle ?? (SCHEDULE_DAY_TYPE_LABELS as Record<string, string>)[input.dayType] ?? input.dayType;
  return `${input.eventLabel} — ${dayLabel}`;
}

/** The digest description body ('\n'-joined; '' when the day has no rows). */
export function digestDescription(items: readonly DigestItem[]): string {
  const sorted = sortDigestItems(items);
  const lines: string[] = [];
  for (const row of sorted.filter((i) => i.startTime !== null)) {
    const range = formatWallClockRange(row.startTime as string, row.endTime);
    lines.push(
      [`${range}${row.nextDay ? ' (+1)' : ''}`, row.name, row.stageName]
        .filter(Boolean)
        .join(' · '),
    );
  }
  const untimed = sorted.filter((i) => i.startTime === null);
  if (untimed.length > 0) {
    lines.push('Untimed');
    for (const row of untimed) lines.push([row.name, row.stageName].filter(Boolean).join(' · '));
  }
  return lines.join('\n');
}

/**
 * One digest VEVENT as content lines: stable UID (`day-<eventId>-<dateKey>@…`),
 * all-day non-inclusive DTEND, TRANSP:TRANSPARENT (a schedule digest is not busy time),
 * and supplied deterministic update metadata.
 */
export function digestVEventLines(input: DigestDayInput): string[] {
  const stamp = icsUtcStamp(input.updatedAt);
  const description = digestDescription(input.items);
  const lines = [
    'BEGIN:VEVENT',
    `UID:day-${input.eventId}-${input.dayKey}@46advance.com`,
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(input.dayKey)}`,
    `DTEND;VALUE=DATE:${icsDate(shiftDayKey(input.dayKey, 1))}`,
    'TRANSP:TRANSPARENT',
    `SUMMARY:${escapeIcsText(digestSummary(input))}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Item-mode VEVENTs for one schedule day (Phase 2): one timed VEVENT per pushable item,
 * matching what the Google calendar push produces for the same item (shared content in
 * `lib/schedules/itemEvent.ts`). Untimed items are omitted, as they are in the push, and
 * timed items stay opaque (busy) — the digest's transparency is a digest-only choice.
 *
 * `UID:sched-<eventId>-<itemId>@…` includes the event id so malformed/legacy data
 * repeating an item id can't collide across events. Flipping an event between modes
 * changes every UID in it — the client swaps one all-day event for N timed ones.
 */
export function itemVEventLines(input: {
  eventId: string;
  dayKey: string;
  timeZone: string;
  updatedAt: Date;
  items: readonly DocumentData[];
  resolve: SlotResolver;
}): string[][] {
  const stamp = icsUtcStamp(input.updatedAt);
  const vevents: string[][] = [];
  for (const item of input.items) {
    const itemId = typeof item.id === 'string' ? item.id : '';
    if (!itemId || !shouldHaveEvent(item)) continue;
    const event = buildScheduleItemEvent(item, input.dayKey, input.timeZone, input.resolve);
    if (!event) continue;
    const lines = [
      'BEGIN:VEVENT',
      `UID:sched-${input.eventId}-${itemId}@46advance.com`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${stamp}`,
      `DTSTART:${icsUtcStamp(event.start)}`,
      `DTEND:${icsUtcStamp(event.end)}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
    ];
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    const description = event.descriptionLines.join('\n');
    if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    lines.push('END:VEVENT');
    vevents.push(lines);
  }
  return vevents;
}

/**
 * The full VCALENDAR as content lines. REFRESH-INTERVAL/X-PUBLISHED-TTL are polling
 * HINTS (15 min); the endpoint's Cache-Control max-age is deliberately held BELOW them
 * (300s) so a client honoring the hint never gets a cached body — do not "align" the two
 * (spec § Rendering).
 */
export function feedCalendarLines(vevents: readonly string[][]): string[] {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//46 Entertainment//46 Advance Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    // Both name forms: NAME is the RFC 7986 standard, X-WR-CALNAME the de-facto one
    // clients actually honor (Apple uses it; Google's From-URL flow ignores both and
    // names the calendar after the URL — users rename it once in settings).
    'NAME:46 Advance',
    'X-WR-CALNAME:46 Advance',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
    ...vevents.flat(),
    'END:VCALENDAR',
  ];
}
