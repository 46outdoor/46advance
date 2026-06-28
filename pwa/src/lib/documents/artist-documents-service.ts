/**
 * Artist document library data access (`artistDocuments/{fileId}`). Reads are open to any
 * approved user; classify/delete are admin|organizer (firestore.rules); creation is server-only
 * (`importDriveFolder`). Shared lib.
 */
import { collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { parseArtistDocument, type ArtistDocument } from './artistDocument';

function col() {
  return collection(db, 'artistDocuments');
}

/** Every artist document (used to derive the Artists list). */
export async function listArtistDocuments(): Promise<ArtistDocument[]> {
  const snap = await getDocs(col());
  return snap.docs.map((d) => parseArtistDocument(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name));
}

/** Documents for one artist (by normalized key). */
export async function listDocumentsForArtist(artistKey: string): Promise<ArtistDocument[]> {
  const snap = await getDocs(query(col(), where('artistKey', '==', artistKey)));
  return snap.docs.map((d) => parseArtistDocument(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name));
}

/** Classify (or unclassify) a document. Admin|organizer per firestore.rules. */
export async function setArtistDocumentCategory(id: string, categoryId: string | null): Promise<void> {
  await updateDoc(doc(db, 'artistDocuments', id), { categoryId });
}

/** Update app-side fields — in-app title, notes, obsolete flag (Drive file untouched). Admin|organizer. */
export async function updateArtistDocument(
  id: string,
  fields: { displayName?: string | null; notes?: string | null; obsolete?: boolean },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (fields.displayName !== undefined) update.displayName = fields.displayName;
  if (fields.notes !== undefined) update.notes = fields.notes;
  if (fields.obsolete !== undefined) update.obsolete = fields.obsolete;
  await updateDoc(doc(db, 'artistDocuments', id), update);
}

/** Remove the document from the library (the Drive file itself is untouched). */
export async function deleteArtistDocument(id: string): Promise<void> {
  await deleteDoc(doc(db, 'artistDocuments', id));
}
