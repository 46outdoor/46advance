/**
 * Production record data access (`events/{id}/production/record`). Event-level here;
 * stage-level added in 5.3. Reads/writes gated by firestore.rules (member read,
 * PM/admin write).
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { SectionContent } from '@/lib/advances/fields';
import type { SectionKey, SectionStatus } from '@/lib/advances/sections';
import {
  emptyEventProduction,
  emptyStageProduction,
  parseEventProduction,
  parseStageProduction,
  type EventProduction,
  type ProductionContact,
  type ProductionLink,
  type StageProduction,
} from '@/lib/production/production';

function eventProductionDoc(eventId: string) {
  return doc(db, 'events', eventId, 'production', 'record');
}

function stageProductionDoc(eventId: string, stageId: string) {
  return doc(db, 'events', eventId, 'stages', stageId, 'production', 'record');
}

export async function getEventProduction(eventId: string): Promise<EventProduction> {
  const snap = await getDoc(eventProductionDoc(eventId));
  return snap.exists() ? parseEventProduction(snap.data()) : emptyEventProduction();
}

export async function setEventProductionInfo(eventId: string, info: SectionContent): Promise<void> {
  await setDoc(eventProductionDoc(eventId), { info, updatedAt: serverTimestamp() }, { merge: true });
}

export async function setEventProductionContacts(
  eventId: string,
  contacts: ProductionContact[],
): Promise<void> {
  await setDoc(eventProductionDoc(eventId), { contacts, updatedAt: serverTimestamp() }, { merge: true });
}

export async function setEventProductionLinks(eventId: string, links: ProductionLink[]): Promise<void> {
  await setDoc(eventProductionDoc(eventId), { links, updatedAt: serverTimestamp() }, { merge: true });
}

// ---- Stage-level (per-stage technical house package) ----

export async function getStageProduction(eventId: string, stageId: string): Promise<StageProduction> {
  const snap = await getDoc(stageProductionDoc(eventId, stageId));
  return snap.exists() ? parseStageProduction(snap.data()) : emptyStageProduction();
}

/** Save one department section's house-package content; optionally auto-bump status. */
export async function updateStageProductionContent(
  eventId: string,
  stageId: string,
  deptId: string,
  content: SectionContent,
  bumpToInProgress: boolean,
): Promise<void> {
  const patch: Record<string, unknown> = {
    [`content.${deptId}`]: content,
    updatedAt: serverTimestamp(),
  };
  if (bumpToInProgress) {
    patch[`sections.${deptId}`] = { status: 'in_progress', finalizedAt: null, finalizedBy: null };
  }
  await setDoc(stageProductionDoc(eventId, stageId), patch, { merge: true });
}

/** Set a department section's status (complete stamps finalizedAt/finalizedBy = lock). */
export async function updateStageProductionStatus(
  eventId: string,
  stageId: string,
  key: SectionKey,
  status: SectionStatus,
  uid: string,
): Promise<void> {
  const state =
    status === 'complete'
      ? { status, finalizedAt: serverTimestamp(), finalizedBy: uid }
      : { status, finalizedAt: null, finalizedBy: null };
  await setDoc(
    stageProductionDoc(eventId, stageId),
    { [`sections.${key}`]: state, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function setStageProductionLinks(
  eventId: string,
  stageId: string,
  links: ProductionLink[],
): Promise<void> {
  await setDoc(stageProductionDoc(eventId, stageId), { links, updatedAt: serverTimestamp() }, { merge: true });
}
