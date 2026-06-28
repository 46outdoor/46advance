/**
 * Schedule-template data access (`scheduleTemplates/{id}`). Admin-authored reusable schedule
 * blueprints; read by the event schedule (import) and the event-template clone. CRUD only —
 * the apply/import (blueprint → real `scheduleItems`) lives in the events feature since it
 * writes event subcollections.
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
import {
  parseScheduleTemplate,
  type ScheduleTemplate,
  type ScheduleTemplateInput,
} from './scheduleTemplate';

const templatesCol = () => collection(db, 'scheduleTemplates');
const templateDoc = (id: string) => doc(db, 'scheduleTemplates', id);

export async function listScheduleTemplates(): Promise<ScheduleTemplate[]> {
  const snap = await getDocs(templatesCol());
  return snap.docs
    .map((d) => parseScheduleTemplate(d.id, d.data()))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export async function getScheduleTemplate(id: string): Promise<ScheduleTemplate | null> {
  const snap = await getDoc(templateDoc(id));
  return snap.exists() ? parseScheduleTemplate(snap.id, snap.data()) : null;
}

export async function createScheduleTemplate(
  input: ScheduleTemplateInput,
  creatorUid: string,
): Promise<string> {
  const ref = await addDoc(templatesCol(), {
    name: input.name,
    category: input.category,
    items: input.items ?? [],
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateScheduleTemplate(id: string, input: ScheduleTemplateInput): Promise<void> {
  await updateDoc(templateDoc(id), {
    name: input.name,
    category: input.category,
    items: input.items ?? [],
    updatedAt: serverTimestamp(),
  });
}

export async function deleteScheduleTemplate(id: string): Promise<void> {
  await deleteDoc(templateDoc(id));
}
