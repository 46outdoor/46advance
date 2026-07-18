/**
 * Advance document inclusion IO (`events/{e}/stages/{s}/advances/{a}/documents/{docId}`,
 * Documents PR 3). Include/exclude is an idempotent set/delete keyed by the library
 * doc's id. Reads/writes gated by firestore.rules (member read; advance editors —
 * admin/event PM — curate).
 */
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import {
  advanceDocumentPayload,
  parseAdvanceDocument,
  type AdvanceDocument,
} from '@/lib/documents/advanceDocument';
import type { ArtistDocument } from '@/lib/documents/artistDocument';

function documentsCol(eventId: string, stageId: string, advanceId: string) {
  return collection(db, 'events', eventId, 'stages', stageId, 'advances', advanceId, 'documents');
}

/** The advance's included documents, sorted by display title. */
export async function listAdvanceDocuments(
  eventId: string,
  stageId: string,
  advanceId: string,
): Promise<AdvanceDocument[]> {
  const snap = await getDocs(documentsCol(eventId, stageId, advanceId));
  return snap.docs
    .map((d) => parseAdvanceDocument(d.id, d.data()))
    .sort((a, b) => (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name));
}

/** Include a library doc on the advance (idempotent — re-including overwrites in place). */
export async function includeArtistDocument(
  eventId: string,
  stageId: string,
  advanceId: string,
  document: ArtistDocument,
  uid: string,
): Promise<void> {
  await setDoc(doc(documentsCol(eventId, stageId, advanceId), document.id), {
    ...advanceDocumentPayload(document),
    includePacket: false,
    addedBy: uid,
    addedAt: serverTimestamp(),
  });
}

/** Remove a doc from the advance (the library entry is untouched). */
export async function excludeArtistDocument(
  eventId: string,
  stageId: string,
  advanceId: string,
  documentId: string,
): Promise<void> {
  await deleteDoc(doc(documentsCol(eventId, stageId, advanceId), documentId));
}
