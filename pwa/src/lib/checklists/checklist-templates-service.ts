/**
 * Checklist template IO (`checklistTemplates/{templateId}`). In `lib/` because two
 * features consume it: admin manages (ChecklistTemplatesAdmin), events import
 * (EventChecklistPanel). Rules: any approved user reads; admin writes.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import {
  parseChecklistTemplate,
  type ChecklistTemplate,
  type ChecklistTemplateInput,
} from './checklist';

const templatesCol = () => collection(db, 'checklistTemplates');

/** React Query key for the checklist template list. */
export const checklistTemplatesKey = () => ['checklistTemplates'] as const;

/** All checklist templates, name-sorted. Malformed docs are skipped. */
export async function listChecklistTemplates(): Promise<ChecklistTemplate[]> {
  const snap = await getDocs(templatesCol());
  const out: ChecklistTemplate[] = [];
  for (const d of snap.docs) {
    try {
      out.push(parseChecklistTemplate(d.id, d.data()));
    } catch {
      // skip malformed doc
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Admin-only (enforced by firestore.rules). Returns the new template id. */
export async function createChecklistTemplate(input: ChecklistTemplateInput): Promise<string> {
  const ref = await addDoc(templatesCol(), { ...input, updatedAt: serverTimestamp() });
  return ref.id;
}

/** Admin-only. Full replace of name + items (the editor saves the whole template). */
export async function saveChecklistTemplate(
  id: string,
  input: ChecklistTemplateInput,
): Promise<void> {
  await setDoc(doc(templatesCol(), id), { ...input, updatedAt: serverTimestamp() });
}

/** Admin-only. */
export async function deleteChecklistTemplate(id: string): Promise<void> {
  await deleteDoc(doc(templatesCol(), id));
}
