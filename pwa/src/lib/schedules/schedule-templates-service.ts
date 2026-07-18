/**
 * Schedule-template data access (`scheduleTemplates/{id}`, redesign PR 3). Admin/organizer-
 * authored day-first blueprints; read by the template editor, the event schedule's import,
 * and event creation (default master + event-template clone). CRUD only — applying a
 * template to an event lives in the events feature (it writes event subcollections).
 * Listing skips docs that don't parse (pre-redesign templates linger until reseeded).
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
import { createLogger } from '@/lib/logger';
import {
  parseScheduleTemplate,
  scheduleTemplateInputSchema,
  type ScheduleTemplate,
  type ScheduleTemplateInput,
} from './scheduleTemplate';

const logger = createLogger('ScheduleTemplates');

const templatesCol = () => collection(db, 'scheduleTemplates');
const templateDoc = (id: string) => doc(db, 'scheduleTemplates', id);

export async function listScheduleTemplates(): Promise<ScheduleTemplate[]> {
  const snap = await getDocs(templatesCol());
  const templates: ScheduleTemplate[] = [];
  for (const d of snap.docs) {
    try {
      templates.push(parseScheduleTemplate(d.id, d.data()));
    } catch (e) {
      logger.error(`Skipping unparseable schedule template ${d.id} (pre-redesign shape?)`, e);
    }
  }
  return templates.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

export async function getScheduleTemplate(id: string): Promise<ScheduleTemplate | null> {
  const snap = await getDoc(templateDoc(id));
  return snap.exists() ? parseScheduleTemplate(snap.id, snap.data()) : null;
}

/** Firestore rejects explicit `undefined` anywhere in a payload, but the editor's
 * optional fields (day title/notes, item description, stage name…) arrive as
 * key-present-`undefined` — drop those keys deeply. Plain objects/arrays only, so
 * sentinel values like `serverTimestamp()` pass through untouched. */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefinedDeep) as T;
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefinedDeep(v)]),
    ) as T;
  }
  return value;
}

function toDoc(raw: ScheduleTemplateInput) {
  const input = scheduleTemplateInputSchema.parse(raw);
  return stripUndefinedDeep({
    name: input.name.trim(),
    kind: input.kind,
    category: input.category,
    refs: input.kind === 'master' ? (input.refs ?? []) : [],
    isDefault: input.kind === 'master' ? (input.isDefault ?? false) : false,
    days: input.days ?? [],
  });
}

export async function createScheduleTemplate(
  input: ScheduleTemplateInput,
  creatorUid: string,
): Promise<string> {
  const ref = await addDoc(templatesCol(), {
    ...toDoc(input),
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Whole-doc save. Setting `isDefault` on a master clears it from every other master in
 * the same batch — at most one default exists (the auto-insert target, decision 23). */
export async function updateScheduleTemplate(id: string, input: ScheduleTemplateInput): Promise<void> {
  const payload = { ...toDoc(input), updatedAt: serverTimestamp() };
  if (!payload.isDefault) {
    await updateDoc(templateDoc(id), payload);
    return;
  }
  const others = (await listScheduleTemplates()).filter((t) => t.id !== id && t.isDefault);
  const batch = writeBatch(db);
  batch.update(templateDoc(id), payload);
  for (const other of others) {
    batch.update(templateDoc(other.id), { isDefault: false, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}

export async function deleteScheduleTemplate(id: string): Promise<void> {
  await deleteDoc(templateDoc(id));
}

/** The master template auto-applied on event creation, if one is flagged. */
export async function getDefaultMasterTemplate(): Promise<ScheduleTemplate | null> {
  const all = await listScheduleTemplates();
  return all.find((t) => t.kind === 'master' && t.isDefault) ?? null;
}
