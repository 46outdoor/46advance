/**
 * App-level branding config (`config/branding`) — the shared default logo marks
 * (e.g. 46, Peachtree) auto-applied to every packet/header. Admin-managed (see
 * firestore.rules: any approved user reads; admin writes). The show-specific logo
 * lives per-template / per-event (`eventLogo`), not here.
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { z } from 'zod';
import { db } from '@/services/firebase';
import { logoSchema, parseLogo, type Logo } from './logo';

export interface Branding {
  defaultLogos: Logo[];
}

const brandingDocSchema = z.object({
  defaultLogos: z.array(logoSchema).optional(),
});

function brandingDoc() {
  return doc(db, 'config', 'branding');
}

/** React Query key for the branding config. */
export function brandingKey() {
  return ['config', 'branding'] as const;
}

export async function getBranding(): Promise<Branding> {
  const snap = await getDoc(brandingDoc());
  if (!snap.exists()) return { defaultLogos: [] };
  const d = brandingDocSchema.parse(snap.data());
  return { defaultLogos: (d.defaultLogos ?? []).map(parseLogo) };
}

/** Admin-only (enforced by firestore.rules). Replaces the shared default-logo list. */
export async function setDefaultLogos(defaultLogos: Logo[]): Promise<void> {
  await setDoc(brandingDoc(), { defaultLogos, updatedAt: serverTimestamp() }, { merge: true });
}
