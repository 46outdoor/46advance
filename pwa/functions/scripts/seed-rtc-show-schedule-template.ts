/**
 * Seed/refresh the "Rock the Country Show Schedule" template (`scheduleTemplates/{id}`)
 * from the RTC daily show-schedule sheet (Sioux Falls day) — one show day of the
 * two-stage RTC format, artist names replaced by `{artist N}` slot placeholders that
 * resolve against each event's booked lineup per stage (or render "Headliner"/"Artist N"
 * until a slot is booked). Re-running overwrites the template's content in place
 * (matched by name).
 *
 * Mapping decisions (from the sheet's Check In/Truck Dump/Set Stage | Soundcheck | Show grid):
 * - Artists → slots (per Jared): Main Stage slot 1 = the headliner (Staind on the source
 *   sheet) down to slot 5 (Austin Snell); Raised Rowdy slot 1 = Atlus down to slot 4
 *   (Connor Hicks). Green rows → Main Stage, blue/purple rows → Raised Rowdy — stages
 *   match by name on apply; unmatched names land event-wide.
 * - Check In column dropped (per Jared). Truck Dump is its own item; Set Stage and
 *   Soundcheck merge into one "Set Stage / Soundcheck" item (on this sheet soundcheck
 *   always runs from the set-stage time to the soundcheck stop).
 * - Set Change/DJ Set gaps between sets stay as event-wide Show items; the sheet's
 *   emcee-moment labels become their descriptions.
 * - The END 12:00 AM curfew row → the day's note (no midnight calendar event).
 *
 * Run (from functions/, where firebase-admin is installed):
 *   gcloud auth application-default login   # one-time
 *   GOOGLE_CLOUD_PROJECT=advancethat npx -y tsx scripts/seed-rtc-show-schedule-template.ts
 */
import { randomUUID } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const CREATOR_EMAIL = 'jared@46entertainment.com';
const MAIN = 'Main Stage';
const ROWDY = 'Raised Rowdy';

interface Row {
  item: string;
  type: 'production' | 'show';
  start?: string;
  end?: string;
  /** Stage referenced by NAME (matched to an event's stages on apply). */
  stage?: string;
  desc?: string;
  /** Location detail field (Production type). */
  location?: string;
}

/** One lineup slot's sheet columns: truck dump, set stage → soundcheck stop, show set. */
interface SlotTimes {
  slot: number;
  truckDump: string;
  setStage: [start: string, end: string];
  show: [start: string, end: string];
}

const MAIN_SLOTS: SlotTimes[] = [
  { slot: 1, truckDump: '05:00', setStage: ['05:00', '09:00'], show: ['21:35', '23:05'] },
  { slot: 2, truckDump: '08:00', setStage: ['09:00', '11:30'], show: ['19:35', '20:50'] },
  { slot: 3, truckDump: '10:30', setStage: ['11:30', '12:30'], show: ['17:30', '18:15'] },
  { slot: 4, truckDump: '12:00', setStage: ['12:30', '13:30'], show: ['16:00', '16:30'] },
  { slot: 5, truckDump: '13:00', setStage: ['13:30', '14:30'], show: ['14:45', '15:15'] },
];
const ROWDY_SLOTS: SlotTimes[] = [
  { slot: 1, truckDump: '09:00', setStage: ['09:00', '10:30'], show: ['18:25', '19:10'] },
  { slot: 2, truckDump: '10:00', setStage: ['10:30', '11:30'], show: ['16:40', '17:15'] },
  { slot: 3, truckDump: '10:45', setStage: ['11:30', '12:30'], show: ['15:25', '15:50'] },
  { slot: 4, truckDump: '12:30', setStage: ['12:30', '13:30'], show: ['14:15', '14:35'] },
];

const slotRows = (stage: string, s: SlotTimes): Row[] => [
  { item: `{artist ${s.slot}} — Truck Dump`, type: 'production', start: s.truckDump, stage },
  {
    item: `{artist ${s.slot}} — Set Stage / Soundcheck`,
    type: 'production',
    start: s.setStage[0],
    end: s.setStage[1],
    stage,
  },
  { item: `{artist ${s.slot}}`, type: 'show', start: s.show[0], end: s.show[1], stage },
];

const setChange = (start: string, end: string, desc?: string): Row => ({
  item: 'Set change / DJ set',
  type: 'show',
  start,
  end,
  desc,
});

const ROWS: Row[] = [
  {
    item: 'Parking opens',
    type: 'production',
    start: '12:00',
    location: 'Outside festival grounds',
  },
  { item: 'Festival doors', type: 'show', start: '13:30', end: '14:15' },
  ...MAIN_SLOTS.flatMap((s) => slotRows(MAIN, s)),
  ...ROWDY_SLOTS.flatMap((s) => slotRows(ROWDY, s)),
  setChange('14:35', '14:45', 'Raised Rowdy'),
  setChange('15:15', '15:25', 'RTC emcee welcome moment'),
  setChange('15:50', '16:00', 'Raised Rowdy'),
  setChange('16:30', '16:40', 'RTC emcee moment'),
  setChange('17:15', '17:30', 'Raised Rowdy'),
  setChange('18:15', '18:25', 'RTC emcee moment'),
  setChange('19:10', '19:35'),
  setChange('20:50', '21:35', 'RTC emcee — local acknowledgement'),
];

function toItems(rows: Row[]) {
  return rows.map((row) => ({
    id: randomUUID(),
    type: row.type,
    customLabel: null,
    startTime: row.start ?? null,
    endTime: row.end ?? null,
    endEstimated: false,
    nextDay: false,
    item: row.item,
    description: row.desc ?? null,
    stageName: row.stage ?? null,
    fields: row.location !== undefined ? { location: row.location } : {},
    crew: [],
    pushToCalendar: true,
  }));
}

async function upsert(name: string, creatorUid: string): Promise<void> {
  const content = {
    name,
    kind: 'standard',
    category: 'show',
    refs: [],
    isDefault: false,
    days: [
      {
        offset: 0,
        dayType: 'show',
        title: 'Show Day',
        description: null,
        notes: 'Hard curfew 12:00 AM.',
        items: toItems(ROWS),
      },
    ],
    updatedAt: FieldValue.serverTimestamp(),
  };

  const existing = await db.collection('scheduleTemplates').where('name', '==', name).get();
  if (!existing.empty) {
    // Merge without createdBy — a reseed refreshes content, not attribution.
    await existing.docs[0].ref.set(content, { merge: true });
    console.log(
      `Updated "${name}" (${existing.docs[0].id}) in place: ${ROWS.length} items on 1 day.`,
    );
    return;
  }
  const ref = await db.collection('scheduleTemplates').add({
    ...content,
    createdBy: creatorUid,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`Created "${name}" (${ref.id}): ${ROWS.length} items on 1 day.`);
}

async function main(): Promise<void> {
  const creator = await getAuth().getUserByEmail(CREATOR_EMAIL);
  await upsert('Rock the Country Show Schedule', creator.uid);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
