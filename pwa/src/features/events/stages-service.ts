/**
 * Stage data access (`events/{eventId}/stages/{stageId}`). Co-located in the events
 * feature; domain model in shared @/lib/events/stage. Reads/writes gated by
 * firestore.rules (member read; PM/admin write).
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
import { parseStage, type StageInput, type StageRecord } from '@/lib/events/stage';

function stagesCol(eventId: string) {
  return collection(db, 'events', eventId, 'stages');
}

/** Create a stage; `order` defaults to the end of the current list. */
export async function createStage(
  eventId: string,
  input: StageInput,
  order: number,
): Promise<string> {
  const ref = await addDoc(stagesCol(eventId), {
    name: input.name,
    notes: input.notes ?? null,
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listStages(eventId: string): Promise<StageRecord[]> {
  const snap = await getDocs(stagesCol(eventId));
  return snap.docs
    .map((d) => parseStage(d.id, d.data()))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function getStage(eventId: string, stageId: string): Promise<StageRecord | null> {
  const snap = await getDoc(doc(db, 'events', eventId, 'stages', stageId));
  return snap.exists() ? parseStage(snap.id, snap.data()) : null;
}

export async function updateStage(
  eventId: string,
  stageId: string,
  input: StageInput,
): Promise<void> {
  await updateDoc(doc(db, 'events', eventId, 'stages', stageId), {
    name: input.name,
    notes: input.notes ?? null,
    updatedAt: serverTimestamp(),
  });
}

/** Delete a stage and its advances (cascade — Firestore won't remove subcollections). */
export async function deleteStage(eventId: string, stageId: string): Promise<void> {
  const advances = await getDocs(collection(db, 'events', eventId, 'stages', stageId, 'advances'));
  await Promise.all(advances.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'events', eventId, 'stages', stageId));
}
