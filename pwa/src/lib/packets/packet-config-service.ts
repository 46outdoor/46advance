/**
 * Packet config (`config/packets`) — admin-managed (see firestore.rules: any approved user reads;
 * admin writes). Holds the filename `filenamePattern` and the `{type}` `typeLabel`. The server fills
 * the tokens + sanitizes when it generates or saves a packet; this module is the client read/write
 * for the admin editor. Defaults + token list mirror the server helper
 * `functions/src/lib/pdf/packetFilename.ts` — keep the two in step.
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';

export const DEFAULT_PACKET_FILENAME_PATTERN = '{shortCode} {date} {version} — {type}';
export const DEFAULT_PACKET_TYPE_LABEL = 'Production and Artist Advance';

/** Tokens the pattern may use, with a short description for the admin editor. */
export const PACKET_FILENAME_TOKENS = [
  { token: '{shortCode}', description: 'Event short code (e.g. BOTB) — blank if none' },
  { token: '{festival}', description: 'Festival name (e.g. Rock the Country)' },
  { token: '{location}', description: 'Event location / city' },
  { token: '{date}', description: 'Event start date (mm-dd-yy)' },
  { token: '{version}', description: 'Packet version (v1 on first save; bumped on re-save)' },
  { token: '{type}', description: 'The packet type label (set below)' },
  { token: '{event}', description: 'Full composed event name' },
] as const;

export interface PacketConfig {
  filenamePattern: string;
  typeLabel: string;
}

export function packetConfigKey() {
  return ['config', 'packets'] as const;
}

function packetConfigDoc() {
  return doc(db, 'config', 'packets');
}

/** The admin-configured packet config, with defaults for any unset field. */
export async function getPacketConfig(): Promise<PacketConfig> {
  const data = (await getDoc(packetConfigDoc())).data();
  const pattern = data?.filenamePattern;
  const typeLabel = data?.typeLabel;
  return {
    filenamePattern:
      typeof pattern === 'string' && pattern.trim() ? pattern : DEFAULT_PACKET_FILENAME_PATTERN,
    typeLabel:
      typeof typeLabel === 'string' && typeLabel.trim() ? typeLabel : DEFAULT_PACKET_TYPE_LABEL,
  };
}

/** Persist the packet config (admin only, enforced by rules). */
export async function setPacketConfig(config: PacketConfig): Promise<void> {
  await setDoc(
    packetConfigDoc(),
    {
      filenamePattern: config.filenamePattern.trim() || DEFAULT_PACKET_FILENAME_PATTERN,
      typeLabel: config.typeLabel.trim() || DEFAULT_PACKET_TYPE_LABEL,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
