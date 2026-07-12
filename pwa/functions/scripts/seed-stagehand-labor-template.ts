/**
 * Seed/refresh the "575 Stage — Master Labor Schedule" stagehand schedule template
 * (`scheduleTemplates/{id}`) from the 575 Stage labor grid. Days are labeled first-class
 * template days on the relative-day axis (offset -3 → "Load-in 3" … +2 → the post-show
 * load-out day), each holding its calls; items are titled by call type. Re-running
 * overwrites the template's content in place (matched by name).
 *
 * Run (from functions/, where firebase-admin is installed):
 *   gcloud auth application-default login   # one-time
 *   GOOGLE_CLOUD_PROJECT=advancethat npx -y tsx scripts/seed-stagehand-labor-template.ts
 */
import { randomUUID } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const TEMPLATE_NAME = '575 Stage — Master Labor Schedule';
const CREATOR_EMAIL = 'jared@46entertainment.com';
/** The grid's banner applies to every call: "30 Minute working lunch on all calls". */
const LUNCH_NOTE = '30 minute working lunch';

/** Call types become the item titles (the labor section has no call-type field). */
type CallType = 'Stagehands' | 'Riggers / Climbers' | 'Fork / Lull Operators' | 'Spot Op' | 'Cam Op';

interface Call {
  type: CallType;
  count: number;
  start: string;
  end: string;
  note?: string;
}

interface DayBlock {
  dayOffset: number;
  label: string;
  calls: Call[];
}

const DAYS: DayBlock[] = [
  {
    dayOffset: -3,
    label: 'Stage Build Day 1 + Pre Rig',
    calls: [
      { type: 'Stagehands', count: 12, start: '08:00', end: '18:00' },
      { type: 'Fork / Lull Operators', count: 1, start: '08:00', end: '18:00' },
      { type: 'Riggers / Climbers', count: 2, start: '08:00', end: '18:00' },
      { type: 'Stagehands', count: 8, start: '13:00', end: '18:00' },
      { type: 'Fork / Lull Operators', count: 1, start: '13:00', end: '18:00' },
    ],
  },
  {
    dayOffset: -2,
    label: 'Stage Build Day 2 + Pre Rig',
    calls: [
      { type: 'Stagehands', count: 16, start: '08:00', end: '18:00' },
      { type: 'Fork / Lull Operators', count: 3, start: '08:00', end: '18:00' },
      { type: 'Riggers / Climbers', count: 2, start: '08:00', end: '18:00' },
    ],
  },
  {
    dayOffset: -1,
    label: 'Production Load in Day',
    calls: [
      { type: 'Stagehands', count: 28, start: '08:00', end: '18:00', note: 'Lighting / Audio / Video' },
      { type: 'Fork / Lull Operators', count: 3, start: '08:00', end: '18:00' },
      { type: 'Riggers / Climbers', count: 2, start: '08:00', end: '18:00' },
    ],
  },
  {
    dayOffset: 0,
    label: 'Show Day 1',
    calls: [
      { type: 'Stagehands', count: 28, start: '05:00', end: '13:00' },
      { type: 'Riggers / Climbers', count: 4, start: '05:00', end: '13:00' },
      { type: 'Fork / Lull Operators', count: 2, start: '05:00', end: '13:00' },
      { type: 'Stagehands', count: 12, start: '13:00', end: '22:00' },
      { type: 'Fork / Lull Operators', count: 1, start: '13:00', end: '22:00' },
      { type: 'Cam Op', count: 2, start: '13:00', end: '23:00' },
      { type: 'Spot Op', count: 4, start: '19:00', end: '23:00' },
      { type: 'Stagehands', count: 28, start: '22:00', end: '02:00' },
      { type: 'Riggers / Climbers', count: 2, start: '22:00', end: '02:00' },
      { type: 'Fork / Lull Operators', count: 2, start: '22:00', end: '02:00' },
    ],
  },
  {
    dayOffset: 1,
    label: 'Show Day 2 / Strike',
    calls: [
      { type: 'Stagehands', count: 28, start: '05:00', end: '10:00' },
      { type: 'Riggers / Climbers', count: 4, start: '05:00', end: '10:00' },
      { type: 'Fork / Lull Operators', count: 2, start: '05:00', end: '10:00' },
      { type: 'Stagehands', count: 12, start: '10:00', end: '22:00' },
      { type: 'Fork / Lull Operators', count: 1, start: '10:00', end: '22:00' },
      { type: 'Cam Op', count: 2, start: '13:00', end: '23:00' },
      { type: 'Spot Op', count: 4, start: '19:00', end: '23:00' },
      { type: 'Stagehands', count: 28, start: '22:00', end: '04:00', note: 'Strike' },
      { type: 'Riggers / Climbers', count: 4, start: '22:00', end: '04:00', note: 'Strike' },
      { type: 'Fork / Lull Operators', count: 2, start: '22:00', end: '04:00', note: 'Strike' },
    ],
  },
  {
    dayOffset: 2,
    label: 'Stage Load Out',
    calls: [
      { type: 'Stagehands', count: 24, start: '10:00', end: '20:00' },
      { type: 'Fork / Lull Operators', count: 3, start: '10:00', end: '20:00' },
      { type: 'Riggers / Climbers', count: 2, start: '10:00', end: '20:00' },
    ],
  },
];

/** Flatten day blocks into `ScheduleTemplateItem`-shaped docs (matches itemDocSchema). */
function toItems(days: DayBlock[]) {
  let order = 0;
  return days.flatMap((day) =>
    day.calls.map((call) => ({
      id: randomUUID(),
      section: 'labor',
      customLabel: null,
      title: call.type,
      dayOffset: day.dayOffset,
      timeOfDay: call.start,
      endTimeOfDay: call.end,
      // The grid's end column is "Est End Time" — every call's end is an estimate.
      endEstimated: true,
      stageName: null,
      slot: null,
      location: null,
      notes: call.note ? `${call.note} · ${LUNCH_NOTE}` : LUNCH_NOTE,
      fields: { crewCount: String(call.count) },
      includeInMaster: true,
      order: order++,
    })),
  );
}

async function main(): Promise<void> {
  const creator = await getAuth().getUserByEmail(CREATOR_EMAIL);
  const content = {
    name: TEMPLATE_NAME,
    category: 'stagehand',
    days: DAYS.map((d) => ({ offset: d.dayOffset, label: d.label })),
    items: toItems(DAYS),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const existing = await db.collection('scheduleTemplates').where('name', '==', TEMPLATE_NAME).get();
  if (!existing.empty) {
    await existing.docs[0].ref.update(content);
    console.log(`Updated "${TEMPLATE_NAME}" (${existing.docs[0].id}) in place: ${content.items.length} items across ${content.days.length} days.`);
    return;
  }

  const ref = await db.collection('scheduleTemplates').add({
    ...content,
    createdBy: creator.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`Created "${TEMPLATE_NAME}" (${ref.id}): ${content.items.length} items across ${content.days.length} days.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
