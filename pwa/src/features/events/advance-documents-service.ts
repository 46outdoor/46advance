/**
 * Advance document inclusion IO (`events/{e}/stages/{s}/advances/{a}/documents/{docId}`,
 * Documents PR 3). Include/exclude is an idempotent set/delete keyed by the library
 * doc's id. Reads/writes gated by firestore.rules (member read; advance editors —
 * admin/event PM — curate).
 */
import { collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { parseAdvanceDocument, type AdvanceDocument } from '@/lib/documents/advanceDocument';
import { includeArtistDocumentOnAdvance } from '@/lib/google/drive-service';

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

/** Include a library doc on the advance (idempotent — re-including overwrites in place).
 * Server-validated: `includeArtistDocumentOnAdvance` resolves the canonical
 * `artistDocuments` record and copies its trusted metadata (F-1). */
export async function includeArtistDocument(
  eventId: string,
  stageId: string,
  advanceId: string,
  documentId: string,
): Promise<void> {
  await includeArtistDocumentOnAdvance({ eventId, stageId, advanceId, artistDocumentId: documentId });
}

/** Toggle whether an included doc embeds in the generated packet (Documents PR 5). */
export async function setAdvanceDocumentPacket(
  eventId: string,
  stageId: string,
  advanceId: string,
  documentId: string,
  includePacket: boolean,
): Promise<void> {
  await updateDoc(doc(documentsCol(eventId, stageId, advanceId), documentId), { includePacket });
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
