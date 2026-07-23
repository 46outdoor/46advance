import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { zonedDayKey } from '../dates/zonedTime';

/**
 * Admin-configurable packet filename convention. The pattern lives in `config/packets`
 * (`filenamePattern`); the admin edits it in the app. Tokens are filled per event and the
 * result is sanitized into a safe base filename (no extension). Mirrors the client constant
 * in `src/lib/packets/packet-config-service.ts` (separate package — keep the two in step).
 */
export const DEFAULT_PACKET_FILENAME_PATTERN = '{shortCode} {event} — {type}';

/** The `{type}` value for the full-event advance packet (the only packet kind today). */
export const PACKET_TYPE_LABEL = 'Advance Packet';

const MAX_LEN = 120;
// Illegal in Drive / most filesystems (spaces + hyphens are kept — they're fine in names).
const ILLEGAL = /[\\/:*?"<>|]/g;
// Whitespace + dash separators left dangling when a token (e.g. an empty short code) drops out.
const EDGE_SEPARATORS = /^[\s—–-]+|[\s—–-]+$/g;

export interface PacketFilenameTokens {
  shortCode: string;
  event: string;
  date: string;
  type: string;
}

/** Fill the pattern's tokens, then sanitize into a safe base filename (no extension). */
export function formatPacketFilename(pattern: string, tokens: PacketFilenameTokens): string {
  const filled = (pattern || DEFAULT_PACKET_FILENAME_PATTERN).replace(
    /\{(shortCode|event|date|type)\}/g,
    (_match, key: keyof PacketFilenameTokens) => tokens[key] ?? '',
  );
  const cleaned = filled
    .replace(ILLEGAL, ' ')
    .replace(/\s+/g, ' ')
    .replace(EDGE_SEPARATORS, '')
    .trim()
    .slice(0, MAX_LEN)
    .trim();
  // Never return empty (e.g. an all-blank pattern): fall back to something meaningful.
  return cleaned || tokens.event.trim() || PACKET_TYPE_LABEL;
}

/** Read the admin-configured packet filename pattern (`config/packets`), or the default. */
export async function getPacketFilenamePattern(db: Firestore): Promise<string> {
  const snap = await db.doc('config/packets').get();
  const pattern = snap.data()?.filenamePattern;
  return typeof pattern === 'string' && pattern.trim() ? pattern : DEFAULT_PACKET_FILENAME_PATTERN;
}

/** The configured packet base filename (no extension) for an event document. */
export async function packetBaseName(db: Firestore, ev: DocumentData): Promise<string> {
  const pattern = await getPacketFilenamePattern(db);
  const timeZone = String(ev.timeZone ?? 'America/Chicago');
  const start = typeof ev.startDate?.toDate === 'function' ? (ev.startDate.toDate() as Date) : null;
  return formatPacketFilename(pattern, {
    shortCode: String(ev.shortCode ?? '').trim(),
    event: String(ev.name ?? '').trim(),
    date: start ? zonedDayKey(start, timeZone) : '',
    type: PACKET_TYPE_LABEL,
  });
}
