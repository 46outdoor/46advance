/**
 * Emulator-backed tests for the calendar feed: the credential callables
 * (create/rotate/status + transaction cardinality), admin revocation hooks, and the
 * public `calendarFeed` onRequest endpoint (invoked directly with a fake req/res —
 * firebase-functions-test wraps callables only). Google APIs are never touched; the
 * feed reads only Firestore.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps } from 'firebase-admin/app';
import type { Request } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  calendarFeed,
  createCalendarFeed,
  rotateCalendarFeed,
  getCalendarFeedStatus,
  getCalendarSubscription,
  updateCalendarSubscription,
  setUserApproved,
  deleteUser,
} from './index';
import { feedTokenHash } from './calendarFeedTokens';
import { authContext, callableRequest, clearEmulators, testEnv } from './testing/emulatorHarness';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const ADMIN = authContext('admin-uid', { admin: true, approved: true });
const USER = authContext('user-uid', { approved: true });

/** Unique IPs per test so the per-instance in-memory IP gate never carries over. */
let ipCounter = 0;
const nextIp = () => `10.0.0.${++ipCounter}`;

interface FeedResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

/** Invoke the onRequest handler directly with a minimal GET/HEAD request. */
async function requestFeed(
  token: string,
  {
    method = 'GET',
    ip = nextIp(),
    requestHeaders = {},
  }: { method?: string; ip?: string; requestHeaders?: Record<string, string> } = {},
): Promise<FeedResponse> {
  const result: FeedResponse = { statusCode: 0, body: '', headers: {} };
  let finish: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const res = {
    set(key: string, value: string) {
      result.headers[key] = value;
      return this;
    },
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    send(body: string) {
      result.body = body;
      finish();
      return this;
    },
    end() {
      finish();
      return this;
    },
  };
  const req = { method, ip, query: { token }, headers: requestHeaders };
  await calendarFeed(
    req as unknown as Request,
    res as unknown as Parameters<typeof calendarFeed>[1],
  );
  await done;
  return result;
}

const tokenFromUrl = (url: string): string => url.split('token=')[1];

async function seedUser(uid: string, approved = true): Promise<void> {
  await db.doc(`users/${uid}`).set({ approved });
}

async function seedEvent(eventId: string, uid: string): Promise<void> {
  await db.doc(`events/${eventId}`).set({
    name: 'Boots on the Bend',
    shortCode: 'BOTB',
    timeZone: 'America/Chicago',
    updatedAt: Timestamp.fromDate(new Date('2026-08-01T12:00:00Z')),
  });
  await db.doc(`events/${eventId}/members/${uid}`).set({ role: 'production-manager', uid });
  await db.doc(`events/${eventId}/stages/stage-1`).set({ name: 'Main Stage', order: 0 });
  await db.doc(`events/${eventId}/stages/stage-1/advances/a1`).set({
    artistName: 'Ashley McBryde',
    slot: 1,
  });
  await db.doc(`events/${eventId}/scheduleDays/2026-08-15`).set({
    date: '2026-08-15',
    dayType: 'show',
    title: 'Show Day',
    items: [
      {
        id: 'i1',
        type: 'labor',
        item: 'Crew Call',
        startTime: '08:00',
        endTime: '09:00',
        stageId: 'stage-1',
      },
      { id: 'i2', type: 'show', item: '{artist_1} — Set', startTime: '21:00', stageId: 'stage-1' },
      { id: 'i3', type: 'custom', item: 'Lunch', startTime: null },
      { id: 'i4', type: 'custom', item: 'Secret', startTime: '10:00', pushToCalendar: false },
    ],
    updatedAt: Timestamp.fromDate(new Date('2026-08-02T12:00:00Z')),
    createdBy: uid,
  });
}

describe('calendar feed credentials', () => {
  beforeEach(async () => {
    await clearEmulators();
    await seedUser(USER.uid);
  });

  it('create mints a custom-domain URL whose hashed token is stored, shown once', async () => {
    const { url } = await testEnv.wrap(createCalendarFeed)(callableRequest({}, USER));
    // The Hosting rewrite fronts the function on the app domain (firebase.json).
    expect(url).toMatch(/^https:\/\/46advance\.com\/calendar-feed\?token=/);
    const token = tokenFromUrl(url);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const tokenSnap = await db.doc(`calendarFeeds/${feedTokenHash(token)}`).get();
    expect(tokenSnap.exists).toBe(true);
    expect(tokenSnap.data()).toMatchObject({ uid: USER.uid, revokedAt: null });
    const ownerSnap = await db.doc(`calendarFeedOwners/${USER.uid}`).get();
    expect(ownerSnap.data()?.activeTokenHash).toBe(feedTokenHash(token));
  });

  it('create refuses a second active feed; rotate revokes the old token immediately', async () => {
    const { url: first } = await testEnv.wrap(createCalendarFeed)(callableRequest({}, USER));
    await expect(testEnv.wrap(createCalendarFeed)(callableRequest({}, USER))).rejects.toMatchObject(
      { code: 'already-exists' },
    );

    const { url: second } = await testEnv.wrap(rotateCalendarFeed)(callableRequest({}, USER));
    expect(second).not.toBe(first);
    const oldSnap = await db.doc(`calendarFeeds/${feedTokenHash(tokenFromUrl(first))}`).get();
    expect(oldSnap.data()?.revokedAt).not.toBeNull();
    // Exactly one active feed: the pointer names the new hash.
    const ownerSnap = await db.doc(`calendarFeedOwners/${USER.uid}`).get();
    expect(ownerSnap.data()?.activeTokenHash).toBe(feedTokenHash(tokenFromUrl(second)));
    expect((await requestFeed(tokenFromUrl(first))).statusCode).toBe(404);
  });

  it('status reports active without ever exposing the URL, and requires auth', async () => {
    const before = await testEnv.wrap(getCalendarFeedStatus)(callableRequest({}, USER));
    expect(before).toMatchObject({ active: false, createdAt: null, lastAccessedAt: null });
    await testEnv.wrap(createCalendarFeed)(callableRequest({}, USER));
    const after = await testEnv.wrap(getCalendarFeedStatus)(callableRequest({}, USER));
    expect(after.active).toBe(true);
    expect(after.createdAt).toBeTypeOf('number');
    expect(JSON.stringify(after)).not.toContain('token');
    await expect(testEnv.wrap(getCalendarFeedStatus)(callableRequest({}))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('setUserApproved(false) revokes the feed; deleteUser also removes the pointer', async () => {
    await getAuth().createUser({ uid: USER.uid });
    const { url } = await testEnv.wrap(createCalendarFeed)(callableRequest({}, USER));
    await testEnv.wrap(setUserApproved)(callableRequest({ uid: USER.uid, approved: false }, ADMIN));
    const revoked = await db.doc(`calendarFeeds/${feedTokenHash(tokenFromUrl(url))}`).get();
    expect(revoked.data()?.revokedAt).not.toBeNull();

    await testEnv.wrap(deleteUser)(callableRequest({ uid: USER.uid }, ADMIN));
    expect((await db.doc(`calendarFeedOwners/${USER.uid}`).get()).exists).toBe(false);
  });
});

describe('calendar subscription preferences', () => {
  beforeEach(async () => {
    await clearEmulators();
    await seedUser(USER.uid);
  });

  it('defaults to all events / digest / keep history with no doc, and needs auth', async () => {
    const prefs = await testEnv.wrap(getCalendarSubscription)(callableRequest({}, USER));
    expect(prefs).toEqual({
      itemModeEventIds: [],
      excludedEventIds: [],
      hidePastEvents: false,
    });
    expect((await db.doc(`calendarSubscriptions/${USER.uid}`).get()).exists).toBe(false);
    await expect(
      testEnv.wrap(updateCalendarSubscription)(callableRequest({ hidePastEvents: true })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('merges partial updates, dedupes ids, and stamps a server updatedAt', async () => {
    await testEnv.wrap(updateCalendarSubscription)(
      callableRequest({ itemModeEventIds: ['a', 'a', 'b'] }, USER),
    );
    const after = await testEnv.wrap(updateCalendarSubscription)(
      callableRequest({ hidePastEvents: true }, USER),
    );
    // The omitted field kept its value; the duplicate id collapsed.
    expect(after).toEqual({
      itemModeEventIds: ['a', 'b'],
      excludedEventIds: [],
      hidePastEvents: true,
    });
    expect(
      (await db.doc(`calendarSubscriptions/${USER.uid}`).get()).data()?.updatedAt,
    ).toBeTruthy();
  });

  it('rejects unknown fields, oversized arrays, and wrong types', async () => {
    for (const bad of [
      { nope: true },
      { itemModeEventIds: Array.from({ length: 251 }, (_, i) => `e${i}`) },
      { excludedEventIds: ['ok', ''] },
      { excludedEventIds: [123] },
      { hidePastEvents: 'yes' },
      { itemModeEventIds: ['x'.repeat(129)] },
    ]) {
      await expect(
        testEnv.wrap(updateCalendarSubscription)(callableRequest(bad, USER)),
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    }
  });
});

describe('calendarFeed endpoint', () => {
  beforeEach(async () => {
    await clearEmulators();
    await seedUser(USER.uid);
  });

  async function mintToken(): Promise<string> {
    const { url } = await testEnv.wrap(createCalendarFeed)(callableRequest({}, USER));
    return tokenFromUrl(url);
  }

  it('rejects non-GET/HEAD with 405 + Allow, and bad credentials with an identical 404', async () => {
    const post = await requestFeed(await mintToken(), { method: 'POST' });
    expect(post.statusCode).toBe(405);
    expect(post.headers.Allow).toBe('GET, HEAD');

    const malformed = await requestFeed('not-a-token');
    const unknown = await requestFeed('A'.repeat(43));
    expect(malformed.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(malformed.body).toBe(unknown.body);
  });

  it('fails closed for a revoked or deleted user even with a live token', async () => {
    const token = await mintToken();
    await seedUser(USER.uid, false);
    expect((await requestFeed(token)).statusCode).toBe(404);
    await db.doc(`users/${USER.uid}`).delete();
    expect((await requestFeed(token)).statusCode).toBe(404);
  });

  it('serves an empty-but-valid calendar for a member of nothing', async () => {
    const res = await requestFeed(await mintToken());
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['Cache-Control']).toBe('private, max-age=300');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(res.body).toContain('BEGIN:VCALENDAR\r\n');
    expect(res.body).toContain('X-WR-CALNAME:46 Advance');
    expect(res.body).not.toContain('BEGIN:VEVENT');
  });

  it('renders member events as digests and drops them on membership removal', async () => {
    await seedEvent('evt-1', USER.uid);
    const token = await mintToken();
    const res = await requestFeed(token);
    expect(res.statusCode).toBe(200);
    // Unfold (RFC 5545: CRLF + space is a continuation) before asserting content —
    // folding may split any phrase mid-line.
    const body = res.body.replace(/\r\n /g, '');
    expect(body).toContain('UID:day-evt-1-2026-08-15@46advance.com');
    expect(body).toContain('SUMMARY:BOTB — Show Day');
    expect(body).toContain('TRANSP:TRANSPARENT');
    expect(body).toContain('DTSTART;VALUE=DATE:20260815');
    expect(body).toContain('8:00–9:00 AM · Crew Call · Main Stage');
    // Placeholder resolved through the shared lineup; untimed section; excluded item.
    expect(body).toContain('9:00 PM · Ashley McBryde — Set · Main Stage');
    expect(body).toContain('Untimed\\nLunch');
    expect(body).not.toContain('Secret');
    // The raw token never appears in the document.
    expect(body).not.toContain(token);

    await db.doc(`events/evt-1/members/${USER.uid}`).delete();
    const after = await requestFeed(token);
    expect(after.statusCode).toBe(200);
    expect(after.body).not.toContain('evt-1');
  });

  it('[1b] HEAD returns GET-identical status/headers with no body', async () => {
    await seedEvent('evt-1', USER.uid);
    const token = await mintToken();
    const get = await requestFeed(token);
    const head = await requestFeed(token, { method: 'HEAD' });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers).toEqual(get.headers);
    expect(head.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
    expect(head.headers.ETag).toBeTruthy();
  });

  it('[1b] answers a matching If-None-Match with 304 and no body; stale ETags get a 200', async () => {
    await seedEvent('evt-1', USER.uid);
    const token = await mintToken();
    const first = await requestFeed(token);
    const etag = first.headers.ETag;
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);

    const conditional = await requestFeed(token, { requestHeaders: { 'if-none-match': etag } });
    expect(conditional.statusCode).toBe(304);
    expect(conditional.body).toBe('');
    expect(conditional.headers.ETag).toBe(etag);
    // Weak-prefixed and list forms match too.
    const weak = await requestFeed(token, {
      requestHeaders: { 'if-none-match': `"other", W/${etag}` },
    });
    expect(weak.statusCode).toBe(304);

    // Content change → new ETag → full 200 again.
    await db
      .doc('events/evt-1/scheduleDays/2026-08-15')
      .set({ title: 'Changed Day' }, { merge: true });
    const changed = await requestFeed(token, { requestHeaders: { 'if-none-match': etag } });
    expect(changed.statusCode).toBe(200);
    expect(changed.headers.ETag).not.toBe(etag);
    expect(changed.body).toContain('BEGIN:VCALENDAR');
  });

  it('[1b] stamps lastAccessedAt once, then throttles for 24h', async () => {
    const token = await mintToken();
    const feedRef = db.doc(`calendarFeeds/${feedTokenHash(token)}`);
    expect((await feedRef.get()).data()?.lastAccessedAt).toBeNull();

    await requestFeed(token);
    const stamped = (await feedRef.get()).data()?.lastAccessedAt;
    expect(stamped).not.toBeNull();

    await requestFeed(token);
    const after = (await feedRef.get()).data()?.lastAccessedAt;
    expect(after?.isEqual(stamped)).toBe(true);
  });

  it('[P2] excludes opted-out events; exclusion beats item mode', async () => {
    await seedEvent('evt-1', USER.uid);
    await seedEvent('evt-2', USER.uid);
    const token = await mintToken();
    expect((await requestFeed(token)).body).toContain('evt-2');

    await testEnv.wrap(updateCalendarSubscription)(
      callableRequest({ excludedEventIds: ['evt-2'], itemModeEventIds: ['evt-2'] }, USER),
    );
    const body = (await requestFeed(token)).body;
    expect(body).toContain('evt-1');
    expect(body).not.toContain('evt-2');
  });

  it('[P2] renders an opted-in event as timed items instead of a digest', async () => {
    await seedEvent('evt-1', USER.uid);
    const token = await mintToken();
    await testEnv.wrap(updateCalendarSubscription)(
      callableRequest({ itemModeEventIds: ['evt-1'] }, USER),
    );
    const body = (await requestFeed(token)).body.replace(/\r\n /g, '');
    // Digest UID gone; one timed VEVENT per pushable item (untimed + opted-out dropped).
    expect(body).not.toContain('UID:day-evt-1-2026-08-15');
    expect(body).toContain('UID:sched-evt-1-i1@46advance.com');
    expect(body).toContain('UID:sched-evt-1-i2@46advance.com');
    expect(body).not.toContain('sched-evt-1-i3'); // untimed Lunch
    expect(body).not.toContain('sched-evt-1-i4'); // pushToCalendar: false
    expect(body).not.toContain('TRANSP:TRANSPARENT');
    expect(body).toContain('SUMMARY:Ashley McBryde — Set');
  });

  it('[P2] hidePastEvents drops events whose last day has passed, keeping current ones', async () => {
    await seedEvent('evt-past', USER.uid);
    await db.doc('events/evt-past/scheduleDays/2026-08-15').delete();
    await db.doc('events/evt-past/scheduleDays/2020-01-01').set({
      date: '2020-01-01',
      dayType: 'show',
      items: [{ id: 'p1', item: 'Old Show', startTime: '20:00' }],
      createdBy: USER.uid,
    });
    await seedEvent('evt-future', USER.uid);
    await db.doc('events/evt-future/scheduleDays/2026-08-15').delete();
    await db.doc('events/evt-future/scheduleDays/2099-01-01').set({
      date: '2099-01-01',
      dayType: 'show',
      items: [{ id: 'f1', item: 'Future Show', startTime: '20:00' }],
      createdBy: USER.uid,
    });
    const token = await mintToken();
    expect((await requestFeed(token)).body).toContain('evt-past');

    await testEnv.wrap(updateCalendarSubscription)(callableRequest({ hidePastEvents: true }, USER));
    const hidden = (await requestFeed(token)).body;
    expect(hidden).not.toContain('evt-past');
    expect(hidden).toContain('evt-future');

    // Turning it back off restores them — the feed is the source of truth.
    await testEnv.wrap(updateCalendarSubscription)(
      callableRequest({ hidePastEvents: false }, USER),
    );
    expect((await requestFeed(token)).body).toContain('evt-past');
  });

  it('enforces the per-token distributed limit with 429 + Retry-After', async () => {
    const token = await mintToken();
    let sawTooMany = false;
    for (let i = 0; i < 35 && !sawTooMany; i++) {
      const res = await requestFeed(token);
      if (res.statusCode === 429) {
        sawTooMany = true;
        expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
      }
    }
    expect(sawTooMany).toBe(true);
  });
});
