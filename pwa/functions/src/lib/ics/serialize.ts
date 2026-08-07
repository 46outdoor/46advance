/**
 * RFC 5545 serialization primitives for the calendar subscription feed
 * (planning/CALENDAR_SUBSCRIPTIONS.md): text escaping, UTC/date formatting, and
 * CRLF assembly with UTF-8-aware 75-octet line folding. Grown from the client's
 * single-event `pwa/src/lib/calendar/ics.ts` (which stays as-is for advance-call
 * downloads) — the feed needs multi-VEVENT documents, `VALUE=DATE`, and folding,
 * which the client builder never did.
 */

/** Escape text per RFC 5545 (backslash, newline, comma, semicolon). CRLF normalizes to
 * one escaped newline and a bare CR is stripped — raw CR must never reach the output,
 * where it could read as a content-line break (defense-in-depth; 2026-08-07 review). */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Format a Date as a UTC iCal timestamp ('YYYYMMDDTHHMMSSZ'). */
export function icsUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Format a 'YYYY-MM-DD' day key as an iCal DATE ('YYYYMMDD'). */
export function icsDate(dayKey: string): string {
  return dayKey.replace(/-/g, '');
}

/**
 * Fold one content line at 75 octets (RFC 5545 §3.1): continuation lines begin with a
 * single space and the 75-octet cap includes it. Splits on code-point boundaries only,
 * so a multi-byte UTF-8 character is never cut mid-sequence.
 */
export function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const folded: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const cp of line) {
    const cpBytes = Buffer.byteLength(cp, 'utf8');
    if (currentBytes + cpBytes > 75) {
      folded.push(current);
      current = ' ';
      currentBytes = 1;
    }
    current += cp;
    currentBytes += cpBytes;
  }
  folded.push(current);
  return folded.join('\r\n');
}

/** Assemble content lines into a CRLF-delimited document, folding each line. */
export function serializeIcs(lines: readonly string[]): string {
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
