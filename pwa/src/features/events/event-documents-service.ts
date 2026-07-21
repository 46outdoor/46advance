/**
 * Event document IO (`events/{e}/documents/{fileId}`, Documents PR 4). Records Drive
 * files uploaded to (or picked into) the event's linked folder; the doc id is the Drive
 * file id. Deleting removes the record only — the Drive file stays in the folder.
 * Reads/writes gated by firestore.rules (member read; PM/admin manage).
 */
import { collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import {
  eventDocumentInputSchema,
  parseEventDocument,
  type EventDocument,
  type EventDocumentInput,
} from '@/lib/documents/eventDocument';
import { registerEventDocument, type DriveUploadResult } from '@/lib/google/drive-service';

function documentsCol(eventId: string) {
  return collection(db, 'events', eventId, 'documents');
}

export async function listEventDocuments(eventId: string): Promise<EventDocument[]> {
  const snap = await getDocs(documentsCol(eventId));
  return snap.docs.map((d) => parseEventDocument(d.id, d.data()));
}

/** Record an uploaded/linked Drive file as an event document (idempotent by file id).
 * Server-validated: `registerEventDocument` verifies the file lives in the event's linked
 * Drive folder and captures Google's canonical metadata (F-1). */
export async function createEventDocument(
  eventId: string,
  file: DriveUploadResult,
  input: EventDocumentInput,
): Promise<void> {
  const parsed = eventDocumentInputSchema.parse(input);
  await registerEventDocument({
    eventId,
    fileId: file.fileId,
    displayName: parsed.displayName?.trim() || null,
    day: parsed.day ?? null,
    categoryId: parsed.categoryId ?? null,
  });
}

/** Update a document's day / category / display name. Only fields present on the input
 * are written — explicit null clears; an absent field leaves the stored value alone. */
export async function updateEventDocument(
  eventId: string,
  documentId: string,
  input: EventDocumentInput,
): Promise<void> {
  const parsed = eventDocumentInputSchema.parse(input);
  const payload: Record<string, string | null> = {};
  if (parsed.day !== undefined) payload.day = parsed.day;
  if (parsed.categoryId !== undefined) payload.categoryId = parsed.categoryId;
  if (parsed.displayName !== undefined) payload.displayName = parsed.displayName.trim() || null;
  await updateDoc(doc(documentsCol(eventId), documentId), payload);
}

/** Remove the record (the Drive file is untouched). */
export async function deleteEventDocument(eventId: string, documentId: string): Promise<void> {
  await deleteDoc(doc(documentsCol(eventId), documentId));
}
