/**
 * One-time migration (Phase 3, planning/CALENDAR_SUBSCRIPTIONS.md): remove the retired
 * per-event calendar linkage from Firestore.
 *
 *   events/{id}.googleCalendarId, .googleCalendarOwnerUid
 *   events/{id}/scheduleDays/{day}.items[].googleCalendarEventId
 *
 * Run this only AFTER the Phase 3 code is deployed. Order matters: while
 * `ensureEventCalendar` still existed, clearing `googleCalendarId` would make the next
 * reconcile RECREATE the calendar — the opposite of the goal. With the push retired
 * there is nothing left to recreate them.
 *
 * NOT touched: `advances/{id}.googleCalendarEventId`. That field is owned by the
 * Appointment Schedule booking sync (attachCallBooking), which is retained — it points at
 * a meeting on the booker's PRIMARY calendar and must survive.
 *
 * Idempotent: re-running is a no-op once the fields are gone.
 *
 * Run (from functions/):
 *   gcloud auth application-default login
 *   GOOGLE_CLOUD_PROJECT=advancethat CONFIRM_PROJECT=advancethat \
 *     npx -y tsx scripts/strip-legacy-calendar-fields.ts
 *
 * Add DRY_RUN=1 to report what would change without writing.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { DocumentData } from 'firebase-admin/firestore';

const TARGET_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!TARGET_PROJECT) {
  console.error('Refusing to run: set GOOGLE_CLOUD_PROJECT=<project>.');
  process.exit(1);
}
// Destructive-run guard (WS-D): this deletes fields on production documents.
if (!DRY_RUN && process.env.CONFIRM_PROJECT !== TARGET_PROJECT) {
  console.error(
    `Refusing to modify project "${TARGET_PROJECT}" without confirmation. Re-run with ` +
      `CONFIRM_PROJECT=${TARGET_PROJECT}, or DRY_RUN=1 to preview.`,
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function main(): Promise<void> {
  console.log(`${DRY_RUN ? 'DRY RUN' : 'MIGRATION'} — project ${TARGET_PROJECT}\n`);
  const events = await db.collection('events').get();
  let eventsCleared = 0;
  let daysCleared = 0;
  let itemsCleared = 0;

  for (const event of events.docs) {
    const hasCalendarFields =
      event.get('googleCalendarId') !== undefined ||
      event.get('googleCalendarOwnerUid') !== undefined;
    if (hasCalendarFields) {
      console.log(`▸ events/${event.id} — clearing googleCalendarId / googleCalendarOwnerUid`);
      if (!DRY_RUN) {
        await event.ref.set(
          {
            googleCalendarId: FieldValue.delete(),
            googleCalendarOwnerUid: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      eventsCleared++;
    }

    const days = await event.ref.collection('scheduleDays').get();
    for (const day of days.docs) {
      const items = day.get('items');
      if (!Array.isArray(items)) continue;
      const stale = items.filter(
        (i) => (i as DocumentData)?.googleCalendarEventId !== undefined,
      ).length;
      if (stale === 0) continue;
      // Rewrite the whole array without the retired key — Firestore has no
      // delete-field-inside-array operation.
      const next = (items as DocumentData[]).map((item) => {
        const { googleCalendarEventId: _retired, ...rest } = item;
        return rest;
      });
      console.log(
        `    events/${event.id}/scheduleDays/${day.id} — ${stale} item(s) carrying googleCalendarEventId`,
      );
      if (!DRY_RUN) {
        await day.ref.update({ items: next, updatedAt: FieldValue.serverTimestamp() });
      }
      daysCleared++;
      itemsCleared += stale;
    }
  }

  console.log(
    `\n${DRY_RUN ? 'Would clear' : 'Cleared'}: ${eventsCleared} event doc(s), ` +
      `${itemsCleared} schedule item(s) across ${daysCleared} day(s).`,
  );
  if (DRY_RUN) console.log(`Re-run with CONFIRM_PROJECT=${TARGET_PROJECT} to apply.`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
