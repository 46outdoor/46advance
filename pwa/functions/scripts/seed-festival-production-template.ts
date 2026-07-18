/**
 * Seed/refresh the "Festival Production Schedule" template (`scheduleTemplates/{id}`)
 * from the Rock the Country production-schedule PDF — the general two-show-day arc used
 * across festivals — plus a one-day "Additional Show Day" companion for stretching an
 * event to three (or more) show days: re-date the tail days +1, then import the
 * companion (its day sits at the extra show-day offset). Re-running overwrites each
 * template's content in place (matched by name).
 *
 * Mapping decisions (from the PDF's Item | Start | End | Location | Vendor grid):
 * - Vendor "VARIOUS"/"ALL" is noise → dropped; "Stageline (+ Labor)" → the description.
 * - Location ("ON SITE"/"AT HOTEL") → the item's Location detail field.
 * - Meals → Custom type labeled "Catering"; arrivals/travel rows → Travel (party field);
 *   doors + run-of-show → Show; everything else → Production.
 * - "VARIOUS"-timed rows are untimed (sort last, no calendar push).
 * - "EST EOD" rows keep only an END time, flagged estimated (untimed start sorts them
 *   last; no calendar push).
 * - Rows after midnight (show-night resets/load-outs) stay grouped on their WORK day's
 *   card, flagged "+1" (next-day AM) — display sorts them last and calendar push
 *   shifts them one date forward.
 *
 * Run (from functions/, where firebase-admin is installed):
 *   gcloud auth application-default login   # one-time
 *   GOOGLE_CLOUD_PROJECT=advancethat npx -y tsx scripts/seed-festival-production-template.ts
 */
import { randomUUID } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const CREATOR_EMAIL = 'jared@46entertainment.com';
const STAGELINE = 'Stageline + labor';

interface Row {
  item: string;
  type: 'production' | 'show' | 'travel' | 'custom';
  customLabel?: string;
  start?: string;
  end?: string;
  endEstimated?: boolean;
  /** "+1": the times are the AM after this day's date (post-show rows). */
  plus1?: boolean;
  desc?: string;
  /** Location detail field (Production/Custom types). */
  location?: string;
  /** Who's moving (Travel type's party field). */
  party?: string;
}

interface DayBlock {
  offset: number;
  dayType: 'travel' | 'loadIn' | 'show' | 'loadOut' | 'offDay';
  title: string;
  notes?: string;
  rows: Row[];
}

const meal = (item: string, start?: string, end?: string, over: Partial<Row> = {}): Row => ({
  item,
  type: 'custom',
  customLabel: 'Catering',
  start,
  end,
  ...over,
});
const prod = (item: string, start?: string, end?: string, over: Partial<Row> = {}): Row => ({
  item,
  type: 'production',
  start,
  end,
  ...over,
});
const travel = (item: string, party: string, over: Partial<Row> = {}): Row => ({
  item,
  type: 'travel',
  party,
  desc: over.desc ?? 'Times vary',
  ...over,
});
/** "EST EOD" — end-time only (untimed start sorts it last), estimated. */
const eod = (end?: string, over: Partial<Row> = {}): Row => ({
  item: 'Est. EOD',
  type: 'production',
  end,
  endEstimated: true,
  ...over,
});

/** A show day's core arc; morning call shifts earlier from day 2 on. */
const showDayRows = (callTime: string, lunchStart: string): Row[] => [
  meal('Breakfast', '05:00', undefined, { location: 'On site' }),
  prod('Call time', callTime),
  prod('Artist load ins', callTime, '14:30'),
  meal('Lunch', lunchStart, '14:00'),
  { item: 'Doors open', type: 'show', start: '14:30' },
  { item: 'ROS — see daily schedule', type: 'show', start: '15:00', end: '23:30' },
  meal('Dinner', '17:00', '19:00'),
  prod('Artist load outs', '23:00', '01:00'),
];
/** Post-show reset for the next show — stays on the show day's card as a "+1" row. */
const overnightReset = prod('Reset stage / dock for the next show', '01:00', '01:30', { plus1: true });
/** Final night's post-show load out + EOD — "+1" rows on the last show day's card. */
const finalNightRows: Row[] = [
  prod('Production load out — all LX + video', '00:30', '03:00', { endEstimated: true, plus1: true }),
  eod('03:00', { plus1: true }),
];

const FINAL_NIGHT_NOTE = 'Goal: all artists out by 12:00 AM; production load out follows the show.';

const DAYS: DayBlock[] = [
  {
    offset: -4,
    dayType: 'travel',
    title: 'Staging Travel',
    rows: [
      travel('Stage hand arrival', 'Stagehands', { desc: 'Stageline · times vary' }),
      travel('Stageline staffing arrival', 'Stageline staffing', { desc: 'Stageline · times vary' }),
      eod(undefined, { desc: 'Times vary' }),
    ],
  },
  {
    offset: -3,
    dayType: 'loadIn',
    title: 'Stage Build Day 1',
    rows: [
      meal('Breakfast', undefined, undefined, { desc: 'Self' }),
      prod('Call time', '08:00', undefined, { desc: STAGELINE }),
      prod('Stage build', '08:00', '13:00', { desc: STAGELINE }),
      meal('Lunch', '13:00', '13:30'),
      prod('Stage build', '13:30', '18:00', { desc: STAGELINE }),
      meal('Dinner', '18:00', '19:00'),
      eod('18:00', { desc: STAGELINE }),
    ],
  },
  {
    offset: -2,
    dayType: 'loadIn',
    title: 'Stage Build Day 2 · Production Travel',
    rows: [
      meal('Breakfast'),
      travel('Production team travels in', 'Production team'),
      prod('Call time', '08:00', undefined, { desc: STAGELINE }),
      prod('Stage / FOH build', '08:00', '13:00', { desc: STAGELINE }),
      meal('Lunch', '13:00', '13:30'),
      prod('Stage / FOH build', '13:30', '18:00', { desc: STAGELINE }),
      meal('Dinner', '18:00', '19:00'),
      eod('18:00', { desc: STAGELINE }),
    ],
  },
  {
    offset: -1,
    dayType: 'loadIn',
    title: 'Production Load In',
    rows: [
      meal('Breakfast', '07:00'),
      prod('Call time — load-in meeting', '07:30', '08:00'),
      prod('Production load in — setup', '08:00', '13:00'),
      meal('Lunch', '13:00', '13:30'),
      prod('Production load in — checks & finalize', '13:30', '20:00'),
      meal('Dinner', '17:00', '19:00'),
      eod('20:00'),
    ],
  },
  {
    offset: 0,
    dayType: 'show',
    title: 'Show Day 1',
    notes: 'Goal: all artists out by 1:00 AM and set for the next day.',
    rows: [...showDayRows('05:30', '11:30'), overnightReset],
  },
  {
    offset: 1,
    dayType: 'show',
    title: 'Show Day 2',
    notes: FINAL_NIGHT_NOTE,
    rows: [...showDayRows('05:00', '12:00'), ...finalNightRows],
  },
  {
    offset: 2,
    dayType: 'loadOut',
    title: 'Staging Load Out',
    rows: [
      meal('Breakfast', '09:00', undefined, { location: 'At hotel' }),
      prod('Call time', '10:00', undefined, { desc: STAGELINE }),
      prod('Staging load out', '10:00', '15:00', { desc: STAGELINE }),
      meal('Lunch', '15:00'),
      prod('Staging load out', '15:00', '18:00', { desc: STAGELINE }),
      travel('Production crew travels out', 'Production crew'),
      eod('20:00'),
    ],
  },
  {
    offset: 3,
    dayType: 'travel',
    title: 'Staging Travel',
    rows: [travel('Stage team travels out', 'Stage team')],
  },
];

/** For 3+ show-day events: re-date the tail days +1 per extra day, then import this —
 * its single day lands on the vacated date as the new FINAL show day (post-show load
 * out included). On the prior show day, swap the final-night load-out/EOD rows for a
 * "reset for the next show" row — it's no longer the last night. */
const ADD_ON_DAYS: DayBlock[] = [
  {
    offset: 2,
    dayType: 'show',
    title: 'Show Day 3',
    notes: FINAL_NIGHT_NOTE,
    rows: [...showDayRows('05:00', '12:00'), ...finalNightRows],
  },
];

function toItems(rows: Row[]) {
  return rows.map((row) => ({
    id: randomUUID(),
    type: row.type,
    customLabel: row.customLabel ?? null,
    startTime: row.start ?? null,
    endTime: row.end ?? null,
    endEstimated: row.endEstimated ?? false,
    nextDay: row.plus1 ?? false,
    item: row.item,
    description: row.desc ?? null,
    stageName: null,
    fields: {
      ...(row.location !== undefined && { location: row.location }),
      ...(row.party !== undefined && { party: row.party }),
    },
    crew: [],
    // Untimed rows (and end-only EOD rows) have no instant to push.
    pushToCalendar: row.start !== undefined,
  }));
}

async function upsert(name: string, days: DayBlock[], creatorUid: string): Promise<void> {
  const content = {
    name,
    kind: 'standard',
    category: 'production',
    refs: [],
    isDefault: false,
    days: days.map((d) => ({
      offset: d.offset,
      dayType: d.dayType,
      title: d.title,
      description: null,
      notes: d.notes ?? null,
      items: toItems(d.rows),
    })),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const itemCount = days.reduce((n, d) => n + d.rows.length, 0);

  const existing = await db.collection('scheduleTemplates').where('name', '==', name).get();
  if (!existing.empty) {
    // Merge without createdBy — a reseed refreshes content, not attribution.
    await existing.docs[0].ref.set(content, { merge: true });
    console.log(`Updated "${name}" (${existing.docs[0].id}) in place: ${itemCount} items across ${days.length} day(s).`);
    return;
  }
  const ref = await db.collection('scheduleTemplates').add({
    ...content,
    createdBy: creatorUid,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`Created "${name}" (${ref.id}): ${itemCount} items across ${days.length} day(s).`);
}

async function main(): Promise<void> {
  const creator = await getAuth().getUserByEmail(CREATOR_EMAIL);
  await upsert('Festival Production Schedule', DAYS, creator.uid);
  await upsert('Festival Production — Additional Show Day', ADD_ON_DAYS, creator.uid);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
