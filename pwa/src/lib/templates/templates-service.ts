/**
 * Template data access (`templates/{templateId}`). Shared lib (admin editor authors;
 * event-create reads). Writes are admin-only per firestore.rules.
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
import { parseTemplate, type TemplateInput, type TemplateRecord } from './template';

function templatesCol() {
  return collection(db, 'templates');
}

export async function listTemplates(): Promise<TemplateRecord[]> {
  const snap = await getDocs(templatesCol());
  return snap.docs.map((d) => parseTemplate(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTemplate(id: string): Promise<TemplateRecord | null> {
  const snap = await getDoc(doc(db, 'templates', id));
  return snap.exists() ? parseTemplate(snap.id, snap.data()) : null;
}

export async function createTemplate(input: TemplateInput): Promise<string> {
  const ref = await addDoc(templatesCol(), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, 'templates', id));
}

/** Patch specific template fields (keys may be dot-paths, e.g. `stageProduction.s1.content.audio`). */
export async function patchTemplate(id: string, data: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db, 'templates', id), { ...data, updatedAt: serverTimestamp() });
}
