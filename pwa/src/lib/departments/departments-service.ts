/**
 * Department data access (`departments/{deptId}`). Shared lib (used by the admin tool
 * and the events feature). Writes are admin-only per firestore.rules.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import {
  DEFAULT_DEPARTMENTS,
  parseDepartment,
  type DepartmentInput,
  type DepartmentRecord,
} from './department';

function deptCol() {
  return collection(db, 'departments');
}

export async function listDepartments(): Promise<DepartmentRecord[]> {
  const snap = await getDocs(deptCol());
  return snap.docs
    .map((d) => parseDepartment(d.id, d.data()))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** Idempotent: seed the default departments only when none exist. */
export async function seedDefaultDepartments(): Promise<void> {
  const existing = await getDocs(deptCol());
  if (!existing.empty) return;
  const batch = writeBatch(db);
  for (const d of DEFAULT_DEPARTMENTS) {
    batch.set(doc(db, 'departments', d.id), { name: d.name, order: d.order });
  }
  await batch.commit();
}

export async function createDepartment(input: DepartmentInput, order: number): Promise<string> {
  const ref = doc(deptCol());
  await setDoc(ref, { name: input.name, order });
  return ref.id;
}

export async function updateDepartment(id: string, input: DepartmentInput): Promise<void> {
  await updateDoc(doc(db, 'departments', id), { name: input.name });
}

export async function deleteDepartment(id: string): Promise<void> {
  await deleteDoc(doc(db, 'departments', id));
}
