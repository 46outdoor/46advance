/**
 * Per-day schedule notes (`events/{eventId}/scheduleNotes/{dayKey}`). One doc per schedule day
 * (the day-group key, a Central `YYYY-MM-DD` or `no-time`) holding a free **master** note plus a
 * note **per section** (Production / Show / Stagehand…). Read by the schedule screen; the master
 * view surfaces the master note and labels each section note ("Production Notes: …").
 * Member read; PM/admin write (firestore.rules).
 */
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { z } from 'zod';
import { db } from '@/services/firebase';
import { SCHEDULE_SECTION_KEYS, type ScheduleSection } from '@/lib/schedules/sections';

export interface DayNotes {
  dayKey: string;
  master: string | null;
  /** Per-section notes; only non-empty sections are present. */
  sections: Partial<Record<ScheduleSection, string>>;
}

/** A day-notes field: the overall master note, or one section's note. */
export type DayNoteField = 'master' | ScheduleSection;

const docSchema = z.object({
  master: z.string().nullable().optional(),
  sections: z.record(z.string(), z.string()).optional(),
});

function notesCol(eventId: string) {
  return collection(db, 'events', eventId, 'scheduleNotes');
}

const SECTION_SET: ReadonlySet<string> = new Set(SCHEDULE_SECTION_KEYS);

/** All day-notes for an event, keyed by day-group key. */
export async function listScheduleNotes(eventId: string): Promise<Map<string, DayNotes>> {
  const snap = await getDocs(notesCol(eventId));
  const map = new Map<string, DayNotes>();
  for (const d of snap.docs) {
    const parsed = docSchema.parse(d.data());
    const sections: Partial<Record<ScheduleSection, string>> = {};
    for (const [key, value] of Object.entries(parsed.sections ?? {})) {
      if (SECTION_SET.has(key) && value) sections[key as ScheduleSection] = value;
    }
    map.set(d.id, { dayKey: d.id, master: parsed.master ?? null, sections });
  }
  return map;
}

/** Set the master note, or one section's note, for a day (merge-write; blank clears it). */
export async function setScheduleNote(
  eventId: string,
  dayKey: string,
  field: DayNoteField,
  text: string,
): Promise<void> {
  const value = text.trim() || null;
  const payload = field === 'master' ? { master: value } : { sections: { [field]: value } };
  await setDoc(
    doc(db, 'events', eventId, 'scheduleNotes', dayKey),
    { ...payload, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
