/**
 * Artist document library data access (`artistDocuments/{fileId}`). Reads are open to any
 * approved user; classify/delete/upload-record are admin|organizer (firestore.rules);
 * bulk creation is server-side (`importDriveFolder`, which also records each file's
 * `sourceFolderId` + the library root — the upload targets). Shared lib.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '@/services/firebase';
import { registerArtistDocument } from '@/lib/google/drive-service';
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

const libraryConfigSchema = z.object({ rootFolderId: z.string().nullable().optional() });

/** The library's root Drive folder (recorded by import) — the parent for new artists'
 * subfolders when uploading. Null until an import has run on the redesigned callable. */
export async function getDocumentsLibraryRoot(): Promise<string | null> {
  const snap = await getDoc(doc(db, 'config', 'documentsLibrary'));
  return libraryConfigSchema.parse(snap.data() ?? {}).rootFolderId ?? null;
}

/** Record a file uploaded to an artist's Drive subfolder as a library document.
 * Server-validated: `registerArtistDocument` verifies the file lives under the library
 * root and derives the artist + canonical metadata from its Drive subfolder (F-1). */
export async function createArtistDocumentRecord(fileId: string): Promise<void> {
  await registerArtistDocument(fileId);
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

/** Mark "verified current" (stamps now) or clear it. The status expires 6 months later (derived). */
export async function setArtistDocumentVerified(id: string, verified: boolean): Promise<void> {
  await updateDoc(doc(db, 'artistDocuments', id), { verifiedAt: verified ? serverTimestamp() : null });
}

/** Remove the document from the library (the Drive file itself is untouched). */
export async function deleteArtistDocument(id: string): Promise<void> {
  await deleteDoc(doc(db, 'artistDocuments', id));
}
