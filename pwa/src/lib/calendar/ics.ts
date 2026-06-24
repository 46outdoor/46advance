/**
 * Minimal iCalendar (.ics) builder (ROADMAP §12, 11a). Pure — produces a single VEVENT so an
 * advance call can be added to any calendar app without a Google account. The Google API path
 * (auto-created Meet links on the org calendar) is 11b.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  start: Date;
  /** Duration in minutes (default 30). */
  durationMinutes?: number;
  description?: string | null;
  /** A URL (e.g. the meeting link) surfaced as LOCATION + URL. */
  url?: string | null;
}

/** Format a Date as a UTC iCal timestamp ('YYYYMMDDTHHMMSSZ'). */
function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escape text per RFC 5545 (commas, semicolons, backslashes, newlines). */
function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/**
 * Build a one-event .ics document string. `dtstamp` defaults to the event start so output is
 * deterministic (testable); callers may pass an explicit stamp.
 */
export function buildIcs(event: IcsEvent, dtstamp: Date = event.start): string {
  const duration = event.durationMinutes ?? 30;
  const end = new Date(event.start.getTime() + duration * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//46 Advance//Advance Call//EN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsUtc(dtstamp)}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.url) {
    lines.push(`LOCATION:${escapeText(event.url)}`);
    lines.push(`URL:${escapeText(event.url)}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/** A safe .ics filename from a title (e.g. "Advance call — Foo" → "advance-call-foo.ics"). */
export function icsFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'event'}.ics`;
}

/** Trigger a browser download of an .ics document. */
export function downloadIcs(event: IcsEvent): void {
  const blob = new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = icsFilename(event.title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
