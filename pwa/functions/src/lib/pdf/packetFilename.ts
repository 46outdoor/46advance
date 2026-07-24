import type { DocumentData, Firestore } from 'firebase-admin/firestore';

/**
 * Admin-configurable packet filename convention. `config/packets` holds `filenamePattern` and the
 * `typeLabel` for the `{type}` token; the admin edits both in the app. Tokens are filled per event
 * and sanitized into a safe base filename (no extension). Mirrors the client constants in
 * `src/lib/packets/packet-config-service.ts` (separate package — keep the two in step).
 */
export const DEFAULT_PACKET_FILENAME_PATTERN = '{shortCode} {date} {version} — {type}';

/** The `{type}` label for the full-event packet, when the admin hasn't overridden it. */
export const DEFAULT_PACKET_TYPE_LABEL = 'Production and Artist Advance';

const MAX_LEN = 120;
// Illegal in Drive / most filesystems (spaces + hyphens are kept — they're fine in names).
const ILLEGAL = /[\\/:*?"<>|]/g;
// Whitespace + dash separators left dangling when a token (e.g. an empty short code) drops out.
const EDGE_SEPARATORS = /^[\s—–-]+|[\s—–-]+$/g;
const TOKEN = /\{(shortCode|festival|location|event|date|version|type)\}/g;

export interface PacketFilenameTokens {
  shortCode: string;
  festival: string;
  location: string;
  event: string;
  date: string;
  version: string;
  type: string;
}

/** Fill the pattern's tokens, then sanitize into a safe base filename (no extension). */
export function formatPacketFilename(pattern: string, tokens: PacketFilenameTokens): string {
  const filled = (pattern || DEFAULT_PACKET_FILENAME_PATTERN).replace(
    TOKEN,
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
  return cleaned || tokens.event.trim() || tokens.type.trim() || DEFAULT_PACKET_TYPE_LABEL;
}

/** `mm-dd-yy` in the event's timezone (e.g. "07-10-26"). */
function formatDateMMDDYY(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')}-${get('day')}-${get('year')}`;
}

/** The admin-configured filename pattern + `{type}` label (`config/packets`), with defaults. */
export async function getPacketConfig(
  db: Firestore,
): Promise<{ pattern: string; typeLabel: string }> {
  const data = (await db.doc('config/packets').get()).data();
  const pattern = data?.filenamePattern;
  const typeLabel = data?.typeLabel;
  return {
    pattern:
      typeof pattern === 'string' && pattern.trim() ? pattern : DEFAULT_PACKET_FILENAME_PATTERN,
    typeLabel:
      typeof typeLabel === 'string' && typeLabel.trim() ? typeLabel : DEFAULT_PACKET_TYPE_LABEL,
  };
}

/** The festival's name for the `{festival}` token, or '' when the event has no festival. */
async function festivalNameOf(db: Firestore, festivalId: unknown): Promise<string> {
  if (typeof festivalId !== 'string' || !festivalId) return '';
  const snap = await db.doc(`festivals/${festivalId}`).get();
  return snap.exists ? String(snap.data()?.name ?? '').trim() : '';
}

/**
 * The configured packet base filename (no extension) for an event doc. `version` (1-based) fills
 * the `{version}` token as "v{n}"; omit it (or pass 0) to leave the token blank.
 */
export async function packetBaseName(
  db: Firestore,
  ev: DocumentData,
  version?: number,
): Promise<string> {
  const { pattern, typeLabel } = await getPacketConfig(db);
  const timeZone = String(ev.timeZone ?? 'America/Chicago');
  const start = typeof ev.startDate?.toDate === 'function' ? (ev.startDate.toDate() as Date) : null;
  return formatPacketFilename(pattern, {
    shortCode: String(ev.shortCode ?? '').trim(),
    festival: await festivalNameOf(db, ev.festivalId),
    location: String(ev.location ?? '').trim(),
    event: String(ev.name ?? '').trim(),
    date: start ? formatDateMMDDYY(start, timeZone) : '',
    version: version && version > 0 ? `v${version}` : '',
    type: typeLabel,
  });
}
