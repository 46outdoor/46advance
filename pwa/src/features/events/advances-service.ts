/**
 * Advance data access (`events/{eventId}/stages/{stageId}/advances/{advanceId}`).
 * Co-located in the events feature; domain model + schemas in shared @/lib/advances.
 * (Department-keyed sections land in 3.3; section status writes added in Phase 2.4.)
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

function advancesCol(eventId: string, stageId: string) {
  return collection(db, 'events', eventId, 'stages', stageId, 'advances');
}

function advanceDoc(eventId: string, stageId: string, advanceId: string) {
  return doc(db, 'events', eventId, 'stages', stageId, 'advances', advanceId);
}

/** Create an advance with one not-started section per enabled department. */
export async function createAdvance(
  eventId: string,
  stageId: string,
  input: AdvanceInput,
  departmentIds: readonly string[],
  creatorUid: string,
): Promise<string> {
  const ref = await addDoc(advancesCol(eventId, stageId), {
    artistName: input.artistName,
    performanceDate: dateToTimestamp(input.performanceDate ?? null),
    stage: input.stage ?? null,
    notes: input.notes ?? null,
    additions: input.additions ?? null,
    concerns: input.concerns ?? null,
    pending: input.pending ?? null,
    sections: initialSections(departmentIds),
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listAdvances(eventId: string, stageId: string): Promise<Advance[]> {
  const snap = await getDocs(advancesCol(eventId, stageId));
  return snap.docs
    .map((d) => parseAdvance(d.id, d.data()))
    .sort((a, b) => a.artistName.localeCompare(b.artistName));
}

export async function getAdvance(
  eventId: string,
  stageId: string,
  advanceId: string,
): Promise<Advance | null> {
  const snap = await getDoc(advanceDoc(eventId, stageId, advanceId));
  return snap.exists() ? parseAdvance(snap.id, snap.data()) : null;
}

export async function updateAdvance(
  eventId: string,
  stageId: string,
  advanceId: string,
  input: AdvanceInput,
): Promise<void> {
  await updateDoc(advanceDoc(eventId, stageId, advanceId), {
    artistName: input.artistName,
    performanceDate: dateToTimestamp(input.performanceDate ?? null),
    stage: input.stage ?? null,
    notes: input.notes ?? null,
    additions: input.additions ?? null,
    concerns: input.concerns ?? null,
    pending: input.pending ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAdvance(
  eventId: string,
  stageId: string,
  advanceId: string,
): Promise<void> {
  await deleteDoc(advanceDoc(eventId, stageId, advanceId));
}

/**
 * Set one section's status. `complete` stamps finalizedAt/finalizedBy (the lock);
 * any other status clears them. Permission + transition validity enforced by rules.
 */
export async function updateSectionStatus(
  eventId: string,
  stageId: string,
  advanceId: string,
  key: SectionKey,
  status: SectionStatus,
  uid: string,
): Promise<void> {
  const state =
    status === 'complete'
      ? { status, finalizedAt: serverTimestamp(), finalizedBy: uid }
      : { status, finalizedAt: null, finalizedBy: null };
  await updateDoc(advanceDoc(eventId, stageId, advanceId), {
    [`sections.${key}`]: state,
    updatedAt: serverTimestamp(),
  });
}
