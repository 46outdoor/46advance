/**
 * Per-event Google calendar inventory + decommission (planning/CALENDAR_SUBSCRIPTIONS.md
 * Phase 3 cleanup / cutover gate 3).
 *
 * The per-event calendars are secondary calendars living inside the PERSONAL Google
 * account of whoever first triggered creation (`events/{id}.googleCalendarOwnerUid`), so
 * neither ADC nor the Drive service account can see them. This script reads
 * `googleTokens/{ownerUid}` and builds an authed OAuth client per owner — which needs the
 * OAuth client id/secret to refresh, passed via env (see usage below).
 *
 * DRY RUN IS THE DEFAULT and is the gate-3 artifact: per calendar it reports the owner,
 * total/future event counts, conference-bearing (Meet) events, and any entry not
 * represented by a known stored calendar id. Read it before deleting anything — the spec
 * warns that a future app-created Meet event can exist ONLY inside an event calendar, and
 * deleting blind destroys it.
 *
 * Run (from functions/ — firebase-admin + googleapis resolve here):
 *
 *   # Inventory (safe, read-only — no CONFIRM_PROJECT needed):
 *   gcloud auth application-default login
 *   GOOGLE_CLOUD_PROJECT=advancethat \
 *     GOOGLE_OAUTH_CLIENT_ID=… GOOGLE_OAUTH_CLIENT_SECRET=… \
 *     npx -y tsx scripts/delete-event-calendars.ts
 *
 *   # Destructive run (deletes every listed calendar) — requires BOTH guards:
 *   GOOGLE_CLOUD_PROJECT=advancethat CONFIRM_PROJECT=advancethat DELETE=1 \
 *     GOOGLE_OAUTH_CLIENT_ID=… GOOGLE_OAUTH_CLIENT_SECRET=… \
 *     npx -y tsx scripts/delete-event-calendars.ts
 *
 * The destructive run treats Google 404/410 as idempotent success and clears the Firestore
 * references only after the calendar is confirmed absent, so re-running is safe.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { google, type calendar_v3 } from 'googleapis';

const TARGET_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
const DELETE = process.env.DELETE === '1';
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '';

if (!TARGET_PROJECT) {
  console.error('Refusing to run: set GOOGLE_CLOUD_PROJECT=<project>.');
  process.exit(1);
}
// Destructive-run guard (WS-D): deleting is irreversible and hits personal Google accounts.
if (DELETE && process.env.CONFIRM_PROJECT !== TARGET_PROJECT) {
  console.error(
    `Refusing to DELETE calendars on project "${TARGET_PROJECT}" without confirmation. ` +
      `Re-run with CONFIRM_PROJECT=${TARGET_PROJECT} once the dry-run inventory is reviewed.`,
  );
  process.exit(1);
}
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Refusing to run: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required to ' +
      "refresh each owner's token. Read them from Secret Manager:\n" +
      '  ./scripts/cli/firebase-safe.sh functions:secrets:access GOOGLE_OAUTH_CLIENT_ID',
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

interface EventCalendarRef {
  eventId: string;
  eventName: string;
  calendarId: string;
  ownerUid: string | null;
}

/** An authed Calendar client for one owner, or null when they have no usable token. */
async function calendarForOwner(ownerUid: string): Promise<calendar_v3.Calendar | null> {
  const snap = await db.collection('googleTokens').doc(ownerUid).get();
  const t = snap.data() as { refreshToken?: string | null } | undefined;
  if (!t?.refreshToken) return null;
  const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  client.setCredentials({ refresh_token: t.refreshToken });
  return google.calendar({ version: 'v3', auth: client });
}

/** True for Google's "this resource doesn't exist (anymore)" responses. */
function isGone(e: unknown): boolean {
  const err = e as { code?: number | string; response?: { status?: number } };
  const status = typeof err?.code === 'number' ? err.code : err?.response?.status;
  return status === 404 || status === 410;
}

interface CalendarReport {
  total: number;
  future: number;
  withConference: number;
  /** Future entries carrying a Meet/conference link — the ones that must not vanish. */
  conferenceSamples: string[];
}

/** Page through a calendar's events and summarize what would be destroyed. */
async function inspectCalendar(
  calendar: calendar_v3.Calendar,
  calendarId: string,
): Promise<CalendarReport> {
  const report: CalendarReport = { total: 0, future: 0, withConference: 0, conferenceSamples: [] };
  const now = Date.now();
  let pageToken: string | undefined;
  do {
    const res = await calendar.events.list({
      calendarId,
      maxResults: 250,
      singleEvents: true,
      showDeleted: false,
      pageToken,
    });
    for (const ev of res.data.items ?? []) {
      report.total++;
      const startRaw = ev.start?.dateTime ?? ev.start?.date ?? null;
      const isFuture = startRaw ? new Date(startRaw).getTime() >= now : false;
      if (isFuture) report.future++;
      const hasConference = Boolean(ev.conferenceData ?? ev.hangoutLink);
      if (hasConference) {
        report.withConference++;
        if (isFuture && report.conferenceSamples.length < 10) {
          report.conferenceSamples.push(
            `${startRaw ?? '(no start)'} — ${ev.summary ?? '(untitled)'} — ${ev.hangoutLink ?? 'conference attached'}`,
          );
        }
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return report;
}

/** Every event doc carrying a stored calendar id. */
async function loadEventCalendars(): Promise<EventCalendarRef[]> {
  const snap = await db.collection('events').get();
  const refs: EventCalendarRef[] = [];
  for (const doc of snap.docs) {
    const calendarId = doc.get('googleCalendarId');
    if (typeof calendarId !== 'string' || !calendarId) continue;
    const ownerUid = doc.get('googleCalendarOwnerUid');
    refs.push({
      eventId: doc.id,
      eventName: String(doc.get('name') ?? '(unnamed)'),
      calendarId,
      ownerUid: typeof ownerUid === 'string' && ownerUid ? ownerUid : null,
    });
  }
  return refs;
}

/**
 * Secondary calendars visible to an owner that are NOT referenced by any event doc —
 * the "entries not represented by known stored calendar ids" gate 3 asks for. These are
 * the ones a blind cleanup would either miss or, worse, that someone still relies on.
 */
async function unknownCalendarsFor(
  calendar: calendar_v3.Calendar,
  knownIds: ReadonlySet<string>,
): Promise<string[]> {
  const unknown: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await calendar.calendarList.list({ maxResults: 250, pageToken });
    for (const entry of res.data.items ?? []) {
      const id = entry.id ?? '';
      // Skip the owner's primary and anything already accounted for.
      if (!id || entry.primary || knownIds.has(id)) continue;
      unknown.push(
        `${entry.summary ?? '(untitled)'} — ${id} (accessRole: ${entry.accessRole ?? '?'})`,
      );
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return unknown;
}

async function main(): Promise<void> {
  console.log(
    `${DELETE ? 'DESTRUCTIVE RUN' : 'DRY RUN (inventory only)'} — project ${TARGET_PROJECT}\n`,
  );
  const refs = await loadEventCalendars();
  if (refs.length === 0) {
    console.log('No event docs carry a googleCalendarId. Nothing to inventory or delete.');
    return;
  }
  const knownIds = new Set(refs.map((r) => r.calendarId));
  console.log(
    `${refs.length} event calendar reference(s) across ${new Set(refs.map((r) => r.ownerUid)).size} owner(s).\n`,
  );

  const clients = new Map<string, calendar_v3.Calendar | null>();
  let deleted = 0;
  let unreachable = 0;
  const ownersSeen = new Set<string>();

  for (const ref of refs) {
    console.log(`▸ ${ref.eventName} (events/${ref.eventId})`);
    console.log(`    calendar: ${ref.calendarId}`);
    console.log(`    owner:    ${ref.ownerUid ?? '(none recorded)'}`);
    if (!ref.ownerUid) {
      console.log(
        '    ⚠ No owner recorded — cannot authenticate. Delete by hand or clear the reference.\n',
      );
      unreachable++;
      continue;
    }
    if (!clients.has(ref.ownerUid)) clients.set(ref.ownerUid, await calendarForOwner(ref.ownerUid));
    const calendar = clients.get(ref.ownerUid) ?? null;
    if (!calendar) {
      console.log('    ⚠ Owner has no stored Google refresh token — cannot reach this calendar.\n');
      unreachable++;
      continue;
    }

    try {
      const report = await inspectCalendar(calendar, ref.calendarId);
      console.log(
        `    events:   ${report.total} total, ${report.future} future, ${report.withConference} with a Meet/conference link`,
      );
      for (const sample of report.conferenceSamples) {
        console.log(`      ⚠ FUTURE + CONFERENCE: ${sample}`);
      }
      if (report.future > 0) {
        console.log(
          '      ⚠ Future entries exist — confirm they are superseded by the feed before deleting.',
        );
      }
    } catch (e) {
      if (isGone(e)) {
        console.log('    (calendar already absent in Google)');
      } else {
        console.log(`    ⚠ Could not read this calendar: ${String(e)}`);
        unreachable++;
        console.log('');
        continue;
      }
    }

    if (!DELETE) {
      console.log('');
      continue;
    }
    try {
      await calendar.calendars.delete({ calendarId: ref.calendarId });
      console.log('    ✓ deleted');
    } catch (e) {
      if (!isGone(e)) {
        console.log(`    ⚠ delete failed, leaving the Firestore reference intact: ${String(e)}`);
        console.log('');
        continue;
      }
      console.log('    ✓ already gone (idempotent)');
    }
    // Only clear the reference once the calendar is confirmed absent.
    await db.doc(`events/${ref.eventId}`).set(
      {
        googleCalendarId: FieldValue.delete(),
        googleCalendarOwnerUid: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    deleted++;
    console.log('    ✓ Firestore reference cleared\n');
  }

  // Unknown/manual calendars per owner — surfaced once each.
  for (const [ownerUid, calendar] of clients) {
    if (!calendar || ownersSeen.has(ownerUid)) continue;
    ownersSeen.add(ownerUid);
    const unknown = await unknownCalendarsFor(calendar, knownIds).catch(() => []);
    if (unknown.length === 0) continue;
    console.log(
      `▸ Other calendars visible to owner ${ownerUid} (NOT app-managed, never deleted here):`,
    );
    for (const line of unknown) console.log(`    · ${line}`);
    console.log('');
  }

  console.log(
    DELETE
      ? `Done. ${deleted} calendar(s) deleted, ${unreachable} unreachable.`
      : `Dry run complete. ${refs.length} calendar(s) inspected, ${unreachable} unreachable. ` +
          `Re-run with CONFIRM_PROJECT=${TARGET_PROJECT} DELETE=1 to delete, once the above is reviewed.`,
  );
}

main().catch((err) => {
  console.error('Inventory failed:', err);
  process.exit(1);
});
