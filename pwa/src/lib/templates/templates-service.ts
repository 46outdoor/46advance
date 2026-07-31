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
  writeBatch,
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

/** Patch specific template fields (keys may be dot-paths, e.g. `stageProduction.s1.content.audio`).
 *  Rejects `isDefault`: this writes one doc, so it can't clear the flag from the others and would
 *  leave two masters. `TemplateInput` omits the field for the same reason — this guards the
 *  untyped dot-path path that the type system can't. */
export async function patchTemplate(id: string, data: Record<string, unknown>): Promise<void> {
  if ('isDefault' in data) {
    throw new Error('Use setDefaultTemplate to set isDefault — patchTemplate breaks exclusivity.');
  }
  await updateDoc(doc(db, 'templates', id), { ...data, updatedAt: serverTimestamp() });
}

/** The master house package the create-event form pre-selects, if one is flagged. */
export async function getDefaultTemplate(): Promise<TemplateRecord | null> {
  const all = await listTemplates();
  return all.find((t) => t.isDefault) ?? null;
}

/** Promoting a template demotes every other one in the same batch, so the "master"
 *  flag can never be ambiguous — the create-event form reads exactly one default. */
export async function setDefaultTemplate(id: string, isDefault: boolean): Promise<void> {
  if (!isDefault) {
    await updateDoc(doc(db, 'templates', id), { isDefault: false, updatedAt: serverTimestamp() });
    return;
  }
  const others = (await listTemplates()).filter((t) => t.id !== id && t.isDefault);
  const batch = writeBatch(db);
  batch.update(doc(db, 'templates', id), { isDefault: true, updatedAt: serverTimestamp() });
  for (const other of others) {
    batch.update(doc(db, 'templates', other.id), { isDefault: false, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}
