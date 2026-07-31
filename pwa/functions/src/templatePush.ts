/**
 * Push a master template's production content onto events that ALREADY exist (admin only).
 *
 * `createEventFromTemplate` seeds the house package at creation time; this is the retrofit for
 * events created before the template changed (or before it existed). Deliberately narrower than
 * create-from-template — only `events/{id}/production/record` and the per-stage house packages —
 * and deliberately additive: the push writes ONLY the keys the template actually carries, merged
 * onto whatever the event already has, so event-local fields (and everything else on those
 * records — a stage's `sections` state machine, its own `links`) survive untouched.
 *
 * Stage ids differ between a template and the events seeded from it, so stages are matched by
 * (trimmed, lowercased) NAME. A template stage that matches nothing is reported in
 * `skippedStages` — the push never creates a stage on an existing event.
 *
 * Contract + semantics: ./contracts/callables/templates.ts.
 */
import {
  getFirestore,
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { assertAdmin } from './lib/auth/authorize.js';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { parseCallableData } from './lib/parseCallable.js';
import { ChunkedBatch } from './lib/db/chunkedBatch.js';
import { asArray } from './lib/db/docValues.js';
import {
  pushTemplateProductionInputSchema,
  templatePushIncludeSchema,
  type TemplatePushChange,
  type TemplatePushEventDiff,
  type TemplatePushInclude,
} from './contracts/callables/templates.js';

/** A Firestore map field, or `{}` for anything that isn't one (missing, scalar, array). */
const asRecord = (v: unknown): DocumentData =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as DocumentData) : {};

/** Render any stored value as preview text. Unset/null both read as empty. */
function valueText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v) ?? '';
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((el, i) => deepEqual(el, b[i]));
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as DocumentData;
  const right = b as DocumentData;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((k) => k in right && deepEqual(left[k], right[k]));
}

/**
 * Absent, null and empty-string are one "no value" state, so a blank template field doesn't
 * masquerade as a change against an event that simply never had that field.
 */
const isBlank = (v: unknown): boolean => v === undefined || v === null || v === '';
const fieldsEqual = (a: unknown, b: unknown): boolean =>
  (isBlank(a) && isBlank(b)) || deepEqual(a, b);

/** One template stage's house package, resolved from `stages[]` + `stageProduction[stageId]`. */
interface TemplateStage {
  name: string;
  /** deptId → fieldKey → value. Empty when the template stage carries no house package. */
  content: DocumentData;
}

/** The template's production blueprint — read once, reused for every target event. */
interface TemplateBlueprint {
  info: DocumentData;
  contacts: unknown[];
  links: unknown[];
  stages: TemplateStage[];
}

/** A queued record write. Merged onto `ref`, with `updatedAt` stamped at commit time. */
interface RecordWrite {
  ref: DocumentReference;
  data: DocumentData;
}

/** What one event resolved to: the preview rows, and the writes that would apply exactly those. */
interface EventPlan {
  diff: TemplatePushEventDiff;
  writes: RecordWrite[];
}

/** Read the template's production blueprint. Throws `not-found` when the template is gone. */
async function readTemplate(db: Firestore, templateId: string): Promise<TemplateBlueprint> {
  const snap = await db.collection('templates').doc(templateId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Template not found.');
  const tpl = snap.data() ?? {};
  const eventProduction = asRecord(tpl.eventProduction);
  const stageProduction = asRecord(tpl.stageProduction);

  const stages: TemplateStage[] = [];
  for (const raw of asArray(tpl.stages)) {
    const stage = asRecord(raw);
    if (typeof stage.name !== 'string') continue;
    const id = typeof stage.id === 'string' ? stage.id : '';
    stages.push({ name: stage.name, content: asRecord(asRecord(stageProduction[id]).content) });
  }

  return {
    info: asRecord(eventProduction.info),
    contacts: asArray(eventProduction.contacts),
    links: asArray(eventProduction.links),
    stages,
  };
}

const eventProductionChange = (key: string, from: string, to: string): TemplatePushChange => ({
  scope: 'eventProduction',
  stageName: null,
  departmentId: null,
  key,
  from,
  to,
});

/**
 * Diff `events/{id}/production/record` against the template. `info` diffs per key; `contacts` and
 * `links` are whole-array units (one change each, carrying entry counts) because they're ordered
 * lists with no stable identity. The write carries only the keys that changed.
 */
function planEventProduction(
  tpl: TemplateBlueprint,
  ref: DocumentReference,
  current: DocumentData,
): { changes: TemplatePushChange[]; write: RecordWrite | null } {
  const changes: TemplatePushChange[] = [];
  const data: DocumentData = {};

  const currentInfo = asRecord(current.info);
  const infoWrite: DocumentData = {};
  for (const [key, next] of Object.entries(tpl.info)) {
    if (fieldsEqual(currentInfo[key], next)) continue;
    changes.push(eventProductionChange(key, valueText(currentInfo[key]), valueText(next)));
    infoWrite[key] = next;
  }
  if (Object.keys(infoWrite).length > 0) data.info = infoWrite;

  for (const key of ['contacts', 'links'] as const) {
    const currentList = asArray(current[key]);
    const nextList = tpl[key];
    if (deepEqual(currentList, nextList)) continue;
    changes.push(eventProductionChange(key, String(currentList.length), String(nextList.length)));
    // set(..., {merge:true}) replaces arrays wholesale — exactly the whole-unit semantics here.
    data[key] = nextList;
  }

  return { changes, write: changes.length > 0 ? { ref, data } : null };
}

/** Diff one matched stage's house package (deptId → fieldKey → value) against the template's. */
function planStageContent(
  stageName: string,
  ref: DocumentReference,
  templateContent: DocumentData,
  current: DocumentData,
): { changes: TemplatePushChange[]; write: RecordWrite | null } {
  const changes: TemplatePushChange[] = [];
  const contentWrite: DocumentData = {};

  for (const [departmentId, rawFields] of Object.entries(templateContent)) {
    const currentFields = asRecord(current[departmentId]);
    const departmentWrite: DocumentData = {};
    for (const [key, next] of Object.entries(asRecord(rawFields))) {
      if (fieldsEqual(currentFields[key], next)) continue;
      changes.push({
        scope: 'stageProduction',
        stageName,
        departmentId,
        key,
        from: valueText(currentFields[key]),
        to: valueText(next),
      });
      departmentWrite[key] = next;
    }
    if (Object.keys(departmentWrite).length > 0) contentWrite[departmentId] = departmentWrite;
  }

  return { changes, write: changes.length > 0 ? { ref, data: { content: contentWrite } } : null };
}

/** The event's stages keyed by trimmed/lowercased name — how template stages are matched. */
async function stagesByName(
  eventRef: DocumentReference,
): Promise<Map<string, QueryDocumentSnapshot>> {
  const snap = await eventRef.collection('stages').get();
  const byName = new Map<string, QueryDocumentSnapshot>();
  for (const doc of snap.docs) {
    const name = doc.get('name');
    if (typeof name === 'string') byName.set(name.trim().toLowerCase(), doc);
  }
  return byName;
}

/** Diff every template stage against the event's same-named stages; unmatched ones are skipped. */
async function planStageProduction(
  eventRef: DocumentReference,
  tpl: TemplateBlueprint,
): Promise<{ changes: TemplatePushChange[]; writes: RecordWrite[]; skippedStages: string[] }> {
  const byName = await stagesByName(eventRef);
  const changes: TemplatePushChange[] = [];
  const writes: RecordWrite[] = [];
  const skippedStages: string[] = [];

  for (const templateStage of tpl.stages) {
    const match = byName.get(templateStage.name.trim().toLowerCase());
    if (!match) {
      skippedStages.push(templateStage.name);
      continue;
    }
    if (Object.keys(templateStage.content).length === 0) continue; // nothing to push, skip the read
    const ref = match.ref.collection('production').doc('record');
    const current = asRecord((await ref.get()).get('content'));
    const stageName =
      typeof match.get('name') === 'string' ? match.get('name') : templateStage.name;
    const planned = planStageContent(stageName, ref, templateStage.content, current);
    changes.push(...planned.changes);
    if (planned.write) writes.push(planned.write);
  }

  return { changes, writes, skippedStages };
}

/** Plan one target event. Returns null when the event no longer exists (the caller skips it). */
async function planEvent(
  db: Firestore,
  tpl: TemplateBlueprint,
  eventId: string,
  include: TemplatePushInclude,
): Promise<EventPlan | null> {
  const eventRef = db.collection('events').doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) return null;

  const changes: TemplatePushChange[] = [];
  const writes: RecordWrite[] = [];
  let skippedStages: string[] = [];

  if (include.production) {
    const ref = eventRef.collection('production').doc('record');
    // A missing record is simply "everything unset" — the merge write creates it.
    const planned = planEventProduction(tpl, ref, (await ref.get()).data() ?? {});
    changes.push(...planned.changes);
    if (planned.write) writes.push(planned.write);
  }

  if (include.stageProduction) {
    const planned = await planStageProduction(eventRef, tpl);
    changes.push(...planned.changes);
    writes.push(...planned.writes);
    skippedStages = planned.skippedStages;
  }

  const name = eventSnap.get('name');
  return {
    diff: { eventId, eventName: typeof name === 'string' ? name : '', changes, skippedStages },
    writes,
  };
}

/**
 * Push a template's production content onto existing events (**admin only**).
 *
 * One callable serves both preview and apply: `dryRun: true` computes the diff and writes
 * nothing; `dryRun: false` recomputes the identical diff and applies exactly it. Writes merge, so
 * only the keys the template carries are touched — an event-local field the template doesn't have
 * survives — and every touched record gets a fresh `updatedAt`. An event whose diff is empty is
 * not written at all.
 *
 * Edge cases:
 *   - unknown `templateId` → `not-found` (nothing is written).
 *   - a requested eventId with no `events/{id}` document is **skipped silently**: it produces no
 *     entry in `events`, so a shorter result array is the signal that a target vanished. Chosen
 *     over throwing so one stale id can't abort a 25-event push mid-apply.
 *   - an event with no production record yet: every template value counts as a change and the
 *     merge write creates the doc.
 *   - a template with no `stageProduction` (or none for a given stage) contributes no stage
 *     changes; unmatched template stages still land in `skippedStages`.
 *   - duplicate ids in `eventIds` are collapsed, so an event appears at most once.
 *
 * Input: `pushTemplateProductionInputSchema`. Returns `pushTemplateProductionOutputSchema`.
 */
export const pushTemplateProduction = onCall(async (request) => {
  assertAdmin(request.auth);
  const { uid } = request.auth;
  const input = parseCallableData(pushTemplateProductionInputSchema, request.data);
  // Resolved once so preview and apply read the same selection; omitted → both keys true.
  const include = templatePushIncludeSchema.parse(input.include ?? {});

  const db = getFirestore();
  await enforceRateLimit(db, ['pushTemplateProduction', uid], 10);
  const tpl = await readTemplate(db, input.templateId);

  const now = FieldValue.serverTimestamp();
  const batch = new ChunkedBatch(db);
  const events: TemplatePushEventDiff[] = [];

  for (const eventId of new Set(input.eventIds)) {
    const plan = await planEvent(db, tpl, eventId, include);
    if (!plan) continue;
    events.push(plan.diff);
    if (input.dryRun) continue;
    for (const write of plan.writes) {
      batch.set(write.ref, { ...write.data, updatedAt: now }, { merge: true });
    }
  }

  // 25 events × (production + per-stage) records can exceed the 500-op batch cap.
  if (!input.dryRun) await batch.commit();
  return { dryRun: input.dryRun, events };
});
