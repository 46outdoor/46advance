/**
 * Document-library config IO (`config/documentsLibrary`). `rootFolderId` is the Google Drive
 * folder the artist library mirrors — what `scheduledLibraryDriveSync` sweeps twice a day. It is
 * set deliberately by an admin here; "Import from Drive" pulls files in but no longer changes it.
 * The folder must be shared with the docs-broker service account for the sync to read it. Rules:
 * any approved user reads; admin writes (the shared `config/{configId}` block).
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';

const configDoc = () => doc(db, 'config', 'documentsLibrary');

/** React Query key for the document-library config. */
export function documentsLibraryKey() {
  return ['config', 'documentsLibrary'] as const;
}

/** The mirrored root folder id, or '' when it has never been set. */
export async function getDocumentsLibraryRoot(): Promise<string> {
  const snap = await getDoc(configDoc());
  const id = snap.data()?.rootFolderId;
  return typeof id === 'string' ? id : '';
}

/** Admin-only (enforced by firestore.rules). Sets the folder the library mirrors. */
export async function setDocumentsLibraryRoot(rootFolderId: string): Promise<void> {
  await setDoc(configDoc(), { rootFolderId: rootFolderId.trim(), updatedAt: serverTimestamp() }, { merge: true });
}
