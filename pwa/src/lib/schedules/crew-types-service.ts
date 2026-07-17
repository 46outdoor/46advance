/**
 * Crew-type config IO (`config/crewTypes`) — the crew-line editor's type options and
 * the admin edit screen's read/write. An absent doc falls back to the seed
 * (parseCrewTypes). Rules: any approved user reads; admin writes (the shared
 * `config/{configId}` block).
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { parseCrewTypes } from './crewTypes';

const crewTypesDoc = () => doc(db, 'config', 'crewTypes');

/** React Query key for the crew-types config. */
export function crewTypesKey() {
  return ['config', 'crewTypes'] as const;
}

export async function getCrewTypes(): Promise<string[]> {
  const snap = await getDoc(crewTypesDoc());
  return parseCrewTypes(snap.data());
}

/** Admin-only (enforced by firestore.rules). Replaces the crew-type list; entries are
 * trimmed/deduped on the next read. */
export async function setCrewTypes(types: readonly string[]): Promise<void> {
  await setDoc(crewTypesDoc(), { types, updatedAt: serverTimestamp() }, { merge: true });
}
