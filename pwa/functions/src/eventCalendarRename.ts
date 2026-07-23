/**
 * Keep an event's Google Calendar name in sync AFTER the calendar already exists. `ensureEventCalendar`
 * names the calendar at creation from the event's short code + name; this trigger patches the calendar
 * summary when the short code or name later changes.
 *
 * Runs as the calendar's OWNER (recorded on the event as `googleCalendarOwnerUid`) — only the owner's
 * account can patch a calendar it created. Best-effort: skipped when there's no calendar, the owner is
 * unknown or not Google-connected, or nothing name-affecting changed; a patch failure is logged, never
 * thrown, so it can't disrupt the event edit. It never writes back to Firestore, so it can't re-trigger.
 */
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { google } from 'googleapis';
import { OAUTH_SECRETS, authedClientForUser, type AuthClient } from './google.js';
import { withGoogleRetry } from './lib/google/retry.js';
import { planCalendarRename } from './lib/events/calendarSummary.js';

export const renameEventCalendarOnChange = onDocumentUpdated(
  { document: 'events/{eventId}', secrets: OAUTH_SECRETS },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const plan = planCalendarRename(before, after);
    if (!plan) return;

    const db = getFirestore();
    let client: AuthClient;
    try {
      client = await authedClientForUser(db, plan.ownerUid);
    } catch {
      logger.info('Event calendar rename skipped — owner not Google-connected', {
        calendarId: plan.calendarId,
      });
      return;
    }

    try {
      const calendar = google.calendar({ version: 'v3', auth: client });
      await withGoogleRetry(
        () =>
          calendar.calendars.patch({
            calendarId: plan.calendarId,
            requestBody: { summary: plan.summary },
          }),
        { label: 'calendars.patch' },
      );
      logger.info('Event calendar renamed', { calendarId: plan.calendarId });
    } catch (err) {
      logger.error('Event calendar rename failed', {
        calendarId: plan.calendarId,
        error: String(err),
      });
    }
  },
);
