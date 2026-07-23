/**
 * Production record data access (`events/{id}/production/record`). Event-level here;
 * stage-level added in 5.3. Reads/writes gated by firestore.rules (member read,
 * PM/admin write).
 */
import {
  type DocumentReference,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { SectionContent } from '@/lib/advances/fields';
import type { SectionKey, SectionStatus } from '@/lib/advances/sections';
import { deleteFile, replaceStoredAsset, uploadFile, validateUpload } from '@/lib/storage/uploads';
import {
  emptyEventProduction,
  emptyStageProduction,
  parseEventProduction,
  parseProductionAttachment,
  parseStageProduction,
  type EventProduction,
  type ProductionAttachment,
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
  await setDoc(
    eventProductionDoc(eventId),
    { info, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function setEventProductionContacts(
  eventId: string,
  contacts: ProductionContact[],
): Promise<void> {
  await setDoc(
    eventProductionDoc(eventId),
    { contacts, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function setEventProductionLinks(
  eventId: string,
  links: ProductionLink[],
): Promise<void> {
  await setDoc(
    eventProductionDoc(eventId),
    { links, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

// ---- Stage-level (per-stage technical house package) ----

export async function getStageProduction(
  eventId: string,
  stageId: string,
): Promise<StageProduction> {
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

// ---- Attachments: one doc per file in the production `attachments` subcollection ----
// (concurrency-safe — no read-modify-write of a shared array). Files in Storage.

function sanitize(name: string): string {
  return name.replace(/[^\w.-]+/g, '_');
}

function attachmentsCol(ref: DocumentReference) {
  return collection(ref, 'attachments');
}

async function addAttachment(
  ref: DocumentReference,
  pathPrefix: string,
  file: File,
  uid: string,
): Promise<void> {
  const error = validateUpload(file);
  if (error) throw new Error(error);
  // Compensating upload (F-5): drop the object if the doc write fails so it isn't orphaned.
  await replaceStoredAsset(
    () => uploadFile(`${pathPrefix}/${Date.now()}_${sanitize(file.name)}`, file),
    (uploaded) =>
      addDoc(attachmentsCol(ref), {
        name: file.name,
        path: uploaded.path,
        url: uploaded.url,
        contentType: uploaded.contentType,
        size: uploaded.size,
        uploadedBy: uid,
        uploadedAt: Timestamp.now(),
      }),
    null,
  );
}

async function removeAttachment(
  ref: DocumentReference,
  attachment: ProductionAttachment,
): Promise<void> {
  // Doc first, then best-effort object delete — a failed delete leaves a harmless orphan, never a
  // record pointing at a deleted file.
  await deleteDoc(doc(attachmentsCol(ref), attachment.id));
  await deleteFile(attachment.path).catch(() => undefined);
}

async function listAttachments(ref: DocumentReference): Promise<ProductionAttachment[]> {
  const snap = await getDocs(attachmentsCol(ref));
  const out: ProductionAttachment[] = [];
  for (const d of snap.docs) {
    try {
      out.push(parseProductionAttachment(d.id, d.data()));
    } catch {
      // skip malformed doc
    }
  }
  return out.sort((a, b) => (a.uploadedAt?.getTime() ?? 0) - (b.uploadedAt?.getTime() ?? 0));
}

export const eventAttachmentsKey = (eventId: string) =>
  ['production', 'attachments', eventId] as const;
export const stageAttachmentsKey = (eventId: string, stageId: string) =>
  ['production', 'attachments', eventId, stageId] as const;

export const listEventProductionAttachments = (eventId: string) =>
  listAttachments(eventProductionDoc(eventId));
export const listStageProductionAttachments = (eventId: string, stageId: string) =>
  listAttachments(stageProductionDoc(eventId, stageId));

export const addEventProductionAttachment = (eventId: string, file: File, uid: string) =>
  addAttachment(eventProductionDoc(eventId), `events/${eventId}/production/event`, file, uid);

export const removeEventProductionAttachment = (
  eventId: string,
  attachment: ProductionAttachment,
) => removeAttachment(eventProductionDoc(eventId), attachment);

export const addStageProductionAttachment = (
  eventId: string,
  stageId: string,
  file: File,
  uid: string,
) =>
  addAttachment(
    stageProductionDoc(eventId, stageId),
    `events/${eventId}/production/stages/${stageId}`,
    file,
    uid,
  );

export const removeStageProductionAttachment = (
  eventId: string,
  stageId: string,
  attachment: ProductionAttachment,
) => removeAttachment(stageProductionDoc(eventId, stageId), attachment);
