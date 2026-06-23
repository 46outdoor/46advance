/**
 * Advance data access (`events/{eventId}/advances/{advanceId}`). Co-located in the
 * events feature because advances are children of events and the UI composes them
 * (the no-cross-feature arch rule forbids events↔advances feature imports). The
 * domain model + schemas live in shared @/lib/advances. Section status writes are
 * added in 2.4.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { dateToTimestamp } from '@/lib/firestore/timestamps';
import { parseAdvance, type Advance, type AdvanceInput } from '@/lib/advances/advance';
import { initialSections, type SectionKey, type SectionStatus } from '@/lib/advances/sections';

function advancesCol(eventId: string) {
  return collection(db, 'events', eventId, 'advances');
}

/** Create an advance with every section initialized to not_started. */
export async function createAdvance(
  eventId: string,
  input: AdvanceInput,
  creatorUid: string,
): Promise<string> {
  const ref = await addDoc(advancesCol(eventId), {
    artistName: input.artistName,
    performanceDate: dateToTimestamp(input.performanceDate ?? null),
    stage: input.stage ?? null,
    notes: input.notes ?? null,
    sections: initialSections(),
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listAdvances(eventId: string): Promise<Advance[]> {
  const snap = await getDocs(advancesCol(eventId));
  return snap.docs
    .map((d) => parseAdvance(d.id, d.data()))
    .sort((a, b) => a.artistName.localeCompare(b.artistName));
}

export async function getAdvance(eventId: string, advanceId: string): Promise<Advance | null> {
  const snap = await getDoc(doc(db, 'events', eventId, 'advances', advanceId));
  return snap.exists() ? parseAdvance(snap.id, snap.data()) : null;
}

export async function updateAdvance(
  eventId: string,
  advanceId: string,
  input: AdvanceInput,
): Promise<void> {
  await updateDoc(doc(db, 'events', eventId, 'advances', advanceId), {
    artistName: input.artistName,
    performanceDate: dateToTimestamp(input.performanceDate ?? null),
    stage: input.stage ?? null,
    notes: input.notes ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAdvance(eventId: string, advanceId: string): Promise<void> {
  await deleteDoc(doc(db, 'events', eventId, 'advances', advanceId));
}

/**
 * Set one section's status. `complete` stamps finalizedAt/finalizedBy (the lock);
 * any other status clears them (start / unlock / reset). Permission + transition
 * validity are enforced by firestore.rules; the UI gates the controls.
 */
export async function updateSectionStatus(
  eventId: string,
  advanceId: string,
  key: SectionKey,
  status: SectionStatus,
  uid: string,
): Promise<void> {
  const state =
    status === 'complete'
      ? { status, finalizedAt: serverTimestamp(), finalizedBy: uid }
      : { status, finalizedAt: null, finalizedBy: null };
  await updateDoc(doc(db, 'events', eventId, 'advances', advanceId), {
    [`sections.${key}`]: state,
    updatedAt: serverTimestamp(),
  });
}
