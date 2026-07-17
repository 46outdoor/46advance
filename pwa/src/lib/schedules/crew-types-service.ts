/**
 * Crew-type config IO (`config/crewTypes`) — read side for the crew-line editor's type
 * options. An absent doc falls back to the seed (parseCrewTypes); the admin edit screen
 * (and write side) lands with the template-editor PR. Rules: any approved user reads;
 * admin writes (the shared `config/{configId}` block).
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { parseCrewTypes } from './crewTypes';

/** React Query key for the crew-types config. */
export function crewTypesKey() {
  return ['config', 'crewTypes'] as const;
}

export async function getCrewTypes(): Promise<string[]> {
  const snap = await getDoc(doc(db, 'config', 'crewTypes'));
  return parseCrewTypes(snap.data());
}
