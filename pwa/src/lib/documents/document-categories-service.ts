/**
 * Document category data access (`documentCategories/{id}`). Shared lib (the admin tool
 * manages; the documents library consumes). Writes are admin-only per firestore.rules.
 * Mirrors @/lib/departments/departments-service.
 */
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/services/firebase';
import {
  DEFAULT_DOCUMENT_CATEGORIES,
  parseDocumentCategory,
  type DocumentCategory,
  type DocumentCategoryInput,
} from './documentCategory';

function categoriesCol() {
  return collection(db, 'documentCategories');
}

export async function listDocumentCategories(): Promise<DocumentCategory[]> {
  const snap = await getDocs(categoriesCol());
  return snap.docs
    .map((d) => parseDocumentCategory(d.id, d.data()))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** Idempotent: seed the default categories only when none exist. */
export async function seedDefaultDocumentCategories(): Promise<void> {
  const existing = await getDocs(categoriesCol());
  if (!existing.empty) return;
  const batch = writeBatch(db);
  for (const c of DEFAULT_DOCUMENT_CATEGORIES) {
    batch.set(doc(db, 'documentCategories', c.id), { name: c.name, order: c.order });
  }
  await batch.commit();
}

export async function createDocumentCategory(input: DocumentCategoryInput, order: number): Promise<string> {
  const ref = doc(categoriesCol());
  await setDoc(ref, { name: input.name, order });
  return ref.id;
}

export async function updateDocumentCategory(id: string, input: DocumentCategoryInput): Promise<void> {
  await updateDoc(doc(db, 'documentCategories', id), { name: input.name });
}

export async function deleteDocumentCategory(id: string): Promise<void> {
  await deleteDoc(doc(db, 'documentCategories', id));
}
