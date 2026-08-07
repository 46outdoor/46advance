/**
 * The public calendar subscription feed (planning/CALENDAR_SUBSCRIPTIONS.md Phase 1):
 * `GET /calendarFeed?token=<token>` returns a per-user iCalendar document generated
 * from Firestore at request time — every event the user is a member of, digest mode
 * (one transparent all-day VEVENT per schedule day). Public because calendar clients
 * cannot authenticate; the 256-bit bearer token in the URL is the credential.
 *
 * Defense order is cheapest-first (approved 2026-08-07): syntactic token check before
 * any I/O → per-IP in-memory gate (with maxInstances pinned, total flood cost is
 * bounded) → single hashed-token lookup → authoritative user gate (fail closed on a
 * missing/revoked account — membership alone must not keep a token alive) → per-token
 * distributed rate limit → generation. All credential failures return the same 404.
 * Google Calendar polls feeds from SHARED crawler IPs — keep the per-IP limit generous
 * (several subscribers can legitimately share one source IP).
 *
 * NEVER log the raw token, the request URL, or the raw query object — only the hash
 * prefix. Platform request-log retention is handled operationally (deploy runbook).
 */
import { onRequest } from 'firebase-functions/v2/https';
import type { Request } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type { Response } from 'express';
import { checkRateLimit, makeRateLimitKey } from './lib/security/rateLimit.js';
import { checkFirestoreRateLimit } from './lib/security/firestoreRateLimit.js';
import { loadEventLineup } from './lib/schedules/lineup.js';
import { digestItemsFromDay, digestVEventLines, feedCalendarLines } from './lib/ics/digest.js';
import { serializeIcs } from './lib/ics/serialize.js';
import { feedTokenHash } from './calendarFeedTokens.js';
import { TIME_ZONE } from './google.js';

/** Unpadded base64url of 32 random bytes — checked BEFORE any I/O. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** Per-IP in-memory gate (per instance; Google's crawlers share IPs across users). */
const IP_LIMIT = 60;
/** Per-token distributed limit — far above any real calendar client's poll rate. */
const TOKEN_LIMIT = 30;

/** The identical 404 for missing, revoked, malformed, or inactive credentials. */
function notFound(res: Response): void {
  res.status(404).send('Not found');
}

function tooMany(res: Response, resetAt: number): void {
  res
    .set('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))))
    .status(429)
    .send('');
}

/** Latest relevant source timestamp for a day's digest (deterministic stamps). The MAX
 * of day and event stamps — the event doc feeds SUMMARY (shortCode/name), so its update
 * must refresh LAST-MODIFIED too. */
function digestUpdatedAt(day: DocumentData, eventData: DocumentData): Date {
  let latest = 0;
  for (const c of [day.updatedAt, day.createdAt, eventData.updatedAt]) {
    if (c instanceof Timestamp) latest = Math.max(latest, c.toMillis());
  }
  return new Date(latest);
}

/** Event ids the user is currently a member of (the confidentiality gate). */
async function memberEventIds(db: Firestore, uid: string): Promise<string[]> {
  const snap = await db.collectionGroup('members').where('uid', '==', uid).get();
  const ids = new Set<string>();
  for (const doc of snap.docs) {
    const eventRef = doc.ref.parent.parent;
    if (eventRef && eventRef.parent.id === 'events') ids.add(eventRef.id);
  }
  return [...ids].sort();
}

/** Render one event's digest VEVENTs (empty when the event vanished or has no days). */
async function renderEventDigests(db: Firestore, eventId: string): Promise<string[][]> {
  const eventSnap = await db.doc(`events/${eventId}`).get();
  if (!eventSnap.exists) return [];
  const eventData = eventSnap.data() ?? {};
  const timeZone =
    typeof eventData.timeZone === 'string' && eventData.timeZone ? eventData.timeZone : TIME_ZONE;
  const eventLabel =
    (typeof eventData.shortCode === 'string' && eventData.shortCode.trim()) ||
    String(eventData.name ?? 'Event');

  const [daysSnap, lineup] = await Promise.all([
    db.collection(`events/${eventId}/scheduleDays`).get(),
    loadEventLineup(db, eventId, timeZone),
  ]);

  const vevents: string[][] = [];
  for (const dayDoc of [...daysSnap.docs].sort((a, b) => a.id.localeCompare(b.id))) {
    const day = dayDoc.data();
    const dayKey = typeof day.date === 'string' && day.date ? day.date : dayDoc.id;
    const items = (Array.isArray(day.items) ? day.items : []) as DocumentData[];
    vevents.push(
      digestVEventLines({
        eventId,
        dayKey,
        eventLabel,
        dayTitle: typeof day.title === 'string' && day.title ? day.title : null,
        dayType: String(day.dayType ?? ''),
        updatedAt: digestUpdatedAt(day, eventData),
        items: digestItemsFromDay(items, lineup.resolverForDay(dayKey), lineup.stageNames),
      }),
    );
  }
  return vevents;
}

export const calendarFeed = onRequest(
  { maxInstances: 2, timeoutSeconds: 60 },
  async (req: Request, res: Response) => {
    if (req.method !== 'GET') {
      res.set('Allow', 'GET').status(405).send('');
      return;
    }
    const ipGate = checkRateLimit(makeRateLimitKey(['calendarFeed', req.ip]), IP_LIMIT, 60_000);
    if (!ipGate.allowed) {
      tooMany(res, ipGate.resetAt);
      return;
    }

    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!TOKEN_RE.test(token)) {
      notFound(res);
      return;
    }
    const tokenHash = feedTokenHash(token);

    try {
      const db = getFirestore();
      const feedSnap = await db.doc(`calendarFeeds/${tokenHash}`).get();
      const feed = feedSnap.data();
      if (!feedSnap.exists || feed?.revokedAt != null || typeof feed?.uid !== 'string') {
        notFound(res);
        return;
      }

      // Authoritative account gate — a revoked/deleted user fails closed even while
      // membership docs (or an interrupted token cleanup) linger.
      const userSnap = await db.doc(`users/${feed.uid}`).get();
      if (!userSnap.exists || userSnap.get('approved') === false) {
        notFound(res);
        return;
      }

      const tokenGate = await checkFirestoreRateLimit(
        db,
        makeRateLimitKey(['calendarFeedToken', tokenHash]),
        TOKEN_LIMIT,
        60_000,
      );
      if (!tokenGate.allowed) {
        tooMany(res, tokenGate.resetAt);
        return;
      }

      const eventIds = await memberEventIds(db, feed.uid);
      const vevents = (
        await Promise.all(eventIds.map((eventId) => renderEventDigests(db, eventId)))
      ).flat();

      res
        .set('Content-Type', 'text/calendar; charset=utf-8')
        .set('Cache-Control', 'private, max-age=300')
        .set('X-Content-Type-Options', 'nosniff')
        .set('X-Robots-Tag', 'noindex, nofollow')
        .status(200)
        .send(serializeIcs(feedCalendarLines(vevents)));
    } catch (e) {
      // Hash prefix only — never the token, URL, or query.
      logger.error('calendarFeed generation failed', {
        tokenHashPrefix: tokenHash.slice(0, 12),
        err: String(e),
      });
      res.status(500).send('Internal error');
    }
  },
);
