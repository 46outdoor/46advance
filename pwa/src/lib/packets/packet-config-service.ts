/**
 * Packet filename convention (`config/packets.filenamePattern`) — admin-managed (see
 * firestore.rules: any approved user reads; admin writes). The server fills the tokens and
 * sanitizes the result when it generates a packet or saves one to Drive; this module is the
 * client read/write for the admin editor. The default + token list mirror the server helper
 * `functions/src/lib/pdf/packetFilename.ts` — keep the two in step.
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';

export const DEFAULT_PACKET_FILENAME_PATTERN = '{shortCode} {event} — {type}';

/** Tokens the pattern may use, with a short description for the admin editor. */
export const PACKET_FILENAME_TOKENS = [
  { token: '{shortCode}', description: 'Event short code (e.g. BOTB) — blank if none' },
  { token: '{event}', description: 'Event name' },
  { token: '{date}', description: 'Event start date (YYYY-MM-DD)' },
  { token: '{type}', description: 'Packet type ("Advance Packet")' },
] as const;

export function packetConfigKey() {
  return ['config', 'packets'] as const;
}

function packetConfigDoc() {
  return doc(db, 'config', 'packets');
}

/** The admin-configured packet filename pattern, or the default when unset. */
export async function getPacketFilenamePattern(): Promise<string> {
  const snap = await getDoc(packetConfigDoc());
  const pattern = snap.data()?.filenamePattern;
  return typeof pattern === 'string' && pattern.trim() ? pattern : DEFAULT_PACKET_FILENAME_PATTERN;
}

/** Persist the packet filename pattern (admin only, enforced by rules). */
export async function setPacketFilenamePattern(pattern: string): Promise<void> {
  await setDoc(
    packetConfigDoc(),
    { filenamePattern: pattern.trim(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}
