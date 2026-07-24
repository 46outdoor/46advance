/**
 * Festivals data access (`festivals/{id}`) — admin CRUD + the logo write. Mirrors
 * `departments-service.ts`; the logo is saved separately (like `setEventLogo`) via the shared
 * `LogoUploader`. See firestore.rules: any approved user reads, admin writes.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { Logo } from '@/lib/branding/logo';
import { parseFestival, sortFestivals, type FestivalInput, type FestivalRecord } from './festival';

function festivalsCol() {
  return collection(db, 'festivals');
}

/** React Query key for the festivals list. */
export function festivalsKey() {
  return ['festivals'] as const;
}

export async function listFestivals(): Promise<FestivalRecord[]> {
  const snap = await getDocs(festivalsCol());
  return sortFestivals(snap.docs.map((d) => parseFestival(d.id, d.data())));
}

export async function createFestival(input: FestivalInput, order: number): Promise<string> {
  const ref = doc(festivalsCol());
  await setDoc(ref, { name: input.name, order, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateFestival(id: string, input: FestivalInput): Promise<void> {
  await updateDoc(doc(db, 'festivals', id), { name: input.name, updatedAt: serverTimestamp() });
}

/** Save the festival's logo (dual-variant), authored via the shared LogoUploader. */
export async function setFestivalLogo(id: string, logo: Logo): Promise<void> {
  await updateDoc(doc(db, 'festivals', id), { logo, updatedAt: serverTimestamp() });
}

export async function deleteFestival(id: string): Promise<void> {
  await deleteDoc(doc(db, 'festivals', id));
}
