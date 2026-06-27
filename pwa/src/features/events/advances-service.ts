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
import type { SectionContent } from '@/lib/advances/fields';
import { parseDriveFile, type DriveFileRef } from '@/lib/google/driveFile';

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
    advanceCallAt: dateToTimestamp(input.advanceCallAt ?? null),
    advanceCallLink: input.advanceCallLink ? input.advanceCallLink : null,
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

/** React Query key for an advance's linked Drive files (subcollection). */
export function driveFilesKey(eventId: string, stageId: string, advanceId: string) {
  return ['driveFiles', eventId, stageId, advanceId] as const;
}

/**
 * Linked Drive files for an advance, oldest first. Read from the
 * `.../advances/{id}/driveFiles/{fileId}` subcollection (server-written by the
 * link/removeDriveFile callables), skipping any malformed docs.
 */
export async function listDriveFiles(
  eventId: string,
  stageId: string,
  advanceId: string,
): Promise<DriveFileRef[]> {
  const snap = await getDocs(collection(advanceDoc(eventId, stageId, advanceId), 'driveFiles'));
  const files: DriveFileRef[] = [];
  for (const d of snap.docs) {
    try {
      files.push(parseDriveFile(d.data()));
    } catch {
      // skip malformed doc
    }
  }
  return files.sort((a, b) => (a.linkedAt?.getTime() ?? 0) - (b.linkedAt?.getTime() ?? 0));
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
    advanceCallAt: dateToTimestamp(input.advanceCallAt ?? null),
    advanceCallLink: input.advanceCallLink ? input.advanceCallLink : null,
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

/**
 * Save a department section's content fields. When `bumpToInProgress` is set, also
 * advances the section status not_started → in_progress (auto, on first data).
 */
export async function updateSectionContent(
  eventId: string,
  stageId: string,
  advanceId: string,
  deptId: string,
  content: SectionContent,
  bumpToInProgress: boolean,
): Promise<void> {
  const patch: Record<string, unknown> = {
    [`content.${deptId}`]: content,
    updatedAt: serverTimestamp(),
  };
  if (bumpToInProgress) {
    patch[`sections.${deptId}`] = { status: 'in_progress', finalizedAt: null, finalizedBy: null };
  }
  await updateDoc(advanceDoc(eventId, stageId, advanceId), patch);
}
