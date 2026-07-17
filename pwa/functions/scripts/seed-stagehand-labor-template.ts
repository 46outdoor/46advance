/**
 * Seed/refresh the "575 Stage — Master Labor Schedule" stagehand schedule template
 * (`scheduleTemplates/{id}`) from the 575 Stage labor grid — redesign shape
 * (planning/SCHEDULE_REDESIGN.md): day-first template days on the relative-day axis,
 * each owning its items; calls sharing a window become ONE labor item ("Crew Call")
 * with per-type crew lines ("(28) Stagehands"). Re-running overwrites the template's
 * content in place (matched by name).
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

/** The day type on the arc: build days are load-in, show days show, the last day out. */
function dayTypeFor(offset: number): string {
  if (offset < 0) return 'loadIn';
  return offset >= 2 ? 'loadOut' : 'show';
}

/** Group a day's calls by their shared window: one labor item per (start, end), its
 * crew lines carrying the per-type quantities; distinct call notes join the lunch note
 * in the item description. Each line's duration is the call window (hours: null). */
function toDayItems(calls: Call[]) {
  const groups = new Map<string, Call[]>();
  for (const call of calls) {
    const key = `${call.start}-${call.end}`;
    const group = groups.get(key);
    if (group) group.push(call);
    else groups.set(key, [call]);
  }
  return [...groups.values()].map((group) => {
    const notes = [...new Set(group.map((c) => c.note).filter((n): n is string => !!n))];
    return {
      id: randomUUID(),
      type: 'labor',
      customLabel: null,
      startTime: group[0].start,
      endTime: group[0].end,
      // The grid's end column is "Est End Time" — every call's end is an estimate.
      endEstimated: true,
      item: 'Crew Call',
      description: [...notes, LUNCH_NOTE].join(' · '),
      stageName: null,
      fields: {},
      crew: group.map((c) => ({ type: c.type, quantity: c.count, hours: null })),
      pushToCalendar: true,
    };
  });
}

async function main(): Promise<void> {
  const creator = await getAuth().getUserByEmail(CREATOR_EMAIL);
  const days = DAYS.map((d) => ({
    offset: d.dayOffset,
    dayType: dayTypeFor(d.dayOffset),
    title: d.label,
    description: null,
    notes: null,
    items: toDayItems(d.calls),
  }));
  const itemCount = days.reduce((n, d) => n + d.items.length, 0);
  const content = {
    name: TEMPLATE_NAME,
    kind: 'standard',
    category: 'stagehand',
    refs: [],
    isDefault: false,
    days,
    updatedAt: FieldValue.serverTimestamp(),
  };

  const existing = await db.collection('scheduleTemplates').where('name', '==', TEMPLATE_NAME).get();
  if (!existing.empty) {
    // Merge without createdBy — a reseed refreshes content, not attribution.
    await existing.docs[0].ref.set(content, { merge: true });
    console.log(`Updated "${TEMPLATE_NAME}" (${existing.docs[0].id}) in place: ${itemCount} items across ${days.length} days.`);
    return;
  }

  const ref = await db.collection('scheduleTemplates').add({
    ...content,
    createdBy: creator.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`Created "${TEMPLATE_NAME}" (${ref.id}): ${itemCount} items across ${days.length} days.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
