/**
 * Event checklist data access (`events/{eventId}/checklist/{itemId}`). PM-only
 * surface — firestore.rules require canEditEvent for read AND write, so this
 * never renders for department leads / techs. Deliberately not part of the
 * advance tracker roll-up.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { dateToTimestamp } from '@/lib/firestore/timestamps';
import {
  parseChecklistItem,
  sortChecklistItems,
  type ChecklistItem,
  type ChecklistSection,
  type ChecklistTemplate,
} from '@/lib/checklists/checklist';

const itemsCol = (eventId: string) => collection(db, 'events', eventId, 'checklist');
const itemDoc = (eventId: string, itemId: string) =>
  doc(db, 'events', eventId, 'checklist', itemId);

/** React Query key for an event's checklist. */
export const eventChecklistKey = (eventId: string) => ['events', 'checklist', eventId] as const;

/** All checklist items, section-then-order sorted. Malformed docs are skipped. */
export async function listChecklistItems(eventId: string): Promise<ChecklistItem[]> {
  const snap = await getDocs(itemsCol(eventId));
  const out: ChecklistItem[] = [];
  for (const d of snap.docs) {
    try {
      out.push(parseChecklistItem(d.id, d.data()));
    } catch {
      // skip malformed doc
    }
  }
  return sortChecklistItems(out);
}

export async function addChecklistItem(
  eventId: string,
  text: string,
  section: ChecklistSection,
  order: number,
): Promise<string> {
  const ref = await addDoc(itemsCol(eventId), {
    text: text.trim(),
    section,
    order,
    completedAt: null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function setChecklistItemText(
  eventId: string,
  itemId: string,
  text: string,
): Promise<void> {
  await updateDoc(itemDoc(eventId, itemId), { text: text.trim() });
}

/** Check (a Date), edit the stamp (another Date), or un-check (null). */
export async function setChecklistItemCompletedAt(
  eventId: string,
  itemId: string,
  completedAt: Date | null,
): Promise<void> {
  await updateDoc(itemDoc(eventId, itemId), { completedAt: dateToTimestamp(completedAt) });
}

export async function deleteChecklistItem(eventId: string, itemId: string): Promise<void> {
  await deleteDoc(itemDoc(eventId, itemId));
}

/**
 * Persist a drag rearrangement: rewrite section + order for every item in one batch
 * (positions are the array index, per section). Sending the full arrangement keeps
 * this correct for cross-section moves without diffing.
 */
export async function applyChecklistArrangement(
  eventId: string,
  arranged: ReadonlyArray<Pick<ChecklistItem, 'id' | 'section'>>,
): Promise<void> {
  const batch = writeBatch(db);
  const counters: Record<string, number> = {};
  for (const item of arranged) {
    const order = counters[item.section] ?? 0;
    counters[item.section] = order + 1;
    batch.update(itemDoc(eventId, item.id), { section: item.section, order });
  }
  await batch.commit();
}

/**
 * Import a template: append its items (unchecked) after each section's existing
 * items. Importing again appends again — no dedupe by design.
 */
export async function importChecklistTemplate(
  eventId: string,
  template: ChecklistTemplate,
  existing: readonly ChecklistItem[],
): Promise<void> {
  const batch = writeBatch(db);
  const counters: Record<string, number> = {};
  for (const item of existing) {
    counters[item.section] = Math.max(counters[item.section] ?? 0, item.order + 1);
  }
  for (const item of template.items) {
    const order = counters[item.section] ?? 0;
    counters[item.section] = order + 1;
    batch.set(doc(itemsCol(eventId)), {
      text: item.text,
      section: item.section,
      order,
      completedAt: null,
      createdAt: serverTimestamp(),
    });
  }
  await batch.commit();
}
