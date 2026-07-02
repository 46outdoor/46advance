/**
 * Phase 11b — Google Calendar + Meet (per-user OAuth).
 *
 * Per-user offline OAuth: each user connects their own Google account; the refresh
 * token is stored server-side in `googleTokens/{uid}` (Admin SDK only — never
 * client-readable). A non-secret status mirror lives in `googleConnections/{uid}`
 * (owner/admin read). One Google calendar is created per event on demand (owned by
 * the connecting user; id stored on the event), and an advance call becomes a
 * Calendar event with a Meet link whose URL is written back to the advance.
 *
 * Secrets (Firebase Functions Secret Manager): GOOGLE_OAUTH_CLIENT_ID,
 * GOOGLE_OAUTH_CLIENT_SECRET. The OAuth client's authorized redirect URI must match
 * `callbackUrl()` exactly.
 */
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { google } from 'googleapis';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { assertApproved } from './lib/auth/authorize.js';
import { parseCallableData } from './lib/parseCallable.js';
import {
  createEventCalendarInputSchema,
  createAdvanceCallInputSchema,
} from './contracts/callables/google.js';

/** OAuth2 client type, taken from googleapis' own auth bundle (avoids a duplicate-copy type clash). */
export type AuthClient = InstanceType<typeof google.auth.OAuth2>;

const CLIENT_ID = defineSecret('GOOGLE_OAUTH_CLIENT_ID');
const CLIENT_SECRET = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');
export const OAUTH_SECRETS = [CLIENT_ID, CLIENT_SECRET];

const PROJECT_ID = 'advancethat';
const REGION = 'us-central1';
/** Org operating timezone — Central. Calendar events carry it explicitly. */
export const TIME_ZONE = 'America/Chicago';
const STATE_TTL_MS = 10 * 60 * 1000;

/** Per-file Drive access (Phase 13). `drive.file` only grants the app files the user
 *  picks via the Google Picker or that the app creates — never the whole Drive. */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
/** Read file METADATA across Drive — required to enumerate a picked folder's contents for the
 *  artist-document import (`drive.file` alone can't list files the app didn't create). Metadata
 *  only (names + links, no content download), which keeps this a *sensitive*, not *restricted*,
 *  scope — a much lower verification bar than `drive.readonly`. */
const DRIVE_METADATA_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  DRIVE_FILE_SCOPE,
  DRIVE_METADATA_SCOPE,
  'openid',
  'email',
];

/**
 * The OAuth redirect URI — the `googleAuthCallback` HTTP function. MUST be registered
 * verbatim as an Authorized redirect URI on the Google OAuth client. Uses the stable
 * 2nd-gen cloudfunctions.net alias in prod and the emulator URL locally.
 */
function callbackUrl(): string {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}/googleAuthCallback`;
  }
  return `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/googleAuthCallback`;
}

export function oauthClient(): AuthClient {
  return new google.auth.OAuth2(CLIENT_ID.value(), CLIENT_SECRET.value(), callbackUrl());
}

/** Pull the connected account email out of the id_token (already TLS-verified by Google). */
function emailFromIdToken(idToken: string | null | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

/** Escape user-derived text before interpolating it into the callback HTML (defense-in-depth). */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

// postMessage payload the callback popup sends its opener on success — MUST match
// GOOGLE_CONNECTED_MESSAGE in pwa/src/config/integrations.ts (separate toolchain).
const GOOGLE_CONNECTED_MESSAGE = '46advance:google-connected';

function htmlPage(title: string, heading: string, body: string, script = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#273449;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#1d2738;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:32px 36px;max-width:380px;text-align:center}
h1{font-size:1.15rem;margin:0 0 10px}p{color:rgba(255,255,255,.7);font-size:.92rem;margin:0;line-height:1.5}</style></head>
<body><div class="card"><h1>${heading}</h1><p>${body}</p></div>${script}</body></html>`;
}

/** PM-or-admin gate (mirrors firestore.rules canEditEvent). Also requires an approved
 *  account — the Admin SDK bypasses rules, so pending/revoked users must be denied here. */
export async function assertCanEditEvent(
  db: Firestore,
  token: DecodedIdToken,
  uid: string,
  eventId: string,
): Promise<void> {
  assertApproved(token);
  if (token.admin === true) return;
  const member = await db.doc(`events/${eventId}/members/${uid}`).get();
  if (!member.exists || member.data()?.role !== 'production-manager') {
    throw new HttpsError('permission-denied', 'Only an admin or the event production manager can do this.');
  }
}

/** Build an OAuth2 client primed with a user's stored tokens; persists refreshes. */
export async function authedClientForUser(db: Firestore, uid: string): Promise<AuthClient> {
  const snap = await db.collection('googleTokens').doc(uid).get();
  const t = snap.data() as
    | { refreshToken?: string | null; accessToken?: string | null; accessTokenExpiry?: number | null }
    | undefined;
  if (!t?.refreshToken) {
    throw new HttpsError('failed-precondition', 'Connect your Google account first.');
  }
  const client = oauthClient();
  client.setCredentials({
    refresh_token: t.refreshToken,
    access_token: t.accessToken ?? undefined,
    expiry_date: t.accessTokenExpiry ?? undefined,
  });
  client.on('tokens', (tokens) => {
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (tokens.access_token) update.accessToken = tokens.access_token;
    if (tokens.expiry_date) update.accessTokenExpiry = tokens.expiry_date;
    if (tokens.refresh_token) update.refreshToken = tokens.refresh_token;
    void db.collection('googleTokens').doc(uid).set(update, { merge: true });
  });
  return client;
}

/** Return the event's Google calendar id, creating one (owned by `uid`) if absent. */
export async function ensureEventCalendar(
  db: Firestore,
  client: AuthClient,
  uid: string,
  eventId: string,
  eventName: string,
): Promise<string> {
  const eventRef = db.doc(`events/${eventId}`);
  const snap = await eventRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Event not found.');
  const existing = snap.data()?.googleCalendarId;
  if (typeof existing === 'string' && existing.length > 0) return existing;

  const calendar = google.calendar({ version: 'v3', auth: client });
  const created = await calendar.calendars.insert({
    requestBody: { summary: `46 Advance — ${eventName}`, timeZone: TIME_ZONE },
  });
  const calendarId = created.data.id;
  if (!calendarId) throw new HttpsError('internal', 'Could not create the event calendar.');

  // Idempotent adopt: two concurrent calls both create a calendar, but only one is stored. In a
  // transaction, claim ours only if the event still has no calendar; if another call won, delete
  // our orphan so the event never ends up with a duplicate (or an unreferenced) Google calendar.
  const adopted = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(eventRef);
    const current = fresh.data()?.googleCalendarId;
    if (typeof current === 'string' && current.length > 0) return current;
    tx.set(
      eventRef,
      { googleCalendarId: calendarId, googleCalendarOwnerUid: uid, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return calendarId;
  });
  if (adopted !== calendarId) {
    await calendar.calendars.delete({ calendarId }).catch(() => undefined);
  }
  return adopted;
}

/**
 * Build the Google OAuth consent URL for the caller. Stores a single-use CSRF `state`
 * in `googleOAuthStates/{state}` mapped to the uid; the callback consumes it. Returns
 * `{ url }` for the client to open (popup/redirect).
 */
export const googleAuthUrl = onCall({ secrets: OAUTH_SECRETS }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  assertApproved(request.auth.token);
  const db = getFirestore();
  await enforceRateLimit(db, ['googleAuthUrl', request.auth.uid], 10);
  const stateRef = db.collection('googleOAuthStates').doc();
  await stateRef.set({ uid: request.auth.uid, createdAt: FieldValue.serverTimestamp() });

  const url = oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token on every (re)connect
    scope: SCOPES,
    state: stateRef.id,
    include_granted_scopes: true,
  });
  return { url };
});

/**
 * OAuth redirect target (browser GET from Google). Validates the `state`, exchanges the
 * `code` for tokens, stores the refresh token in `googleTokens/{uid}` (server-only) and
 * a non-secret status in `googleConnections/{uid}`. Renders a small self-closing page.
 */
export const googleAuthCallback = onRequest({ secrets: OAUTH_SECRETS }, async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  const error = typeof req.query.error === 'string' ? req.query.error : null;

  const fail = (heading: string, body: string, status = 400): void => {
    res.status(status).send(htmlPage('46 Advance — Google', heading, body));
  };

  if (error) return fail('Connection cancelled', 'You can close this window and try again.');
  if (!code || !state) return fail('Invalid request', 'Missing authorization details.');

  const db = getFirestore();
  const stateRef = db.collection('googleOAuthStates').doc(state);
  const stateSnap = await stateRef.get();
  if (!stateSnap.exists) return fail('Link expired', 'Please start the connection again from 46 Advance.');
  const stateData = stateSnap.data() as { uid: string; createdAt?: Timestamp };
  await stateRef.delete();
  const createdMs = stateData.createdAt instanceof Timestamp ? stateData.createdAt.toMillis() : 0;
  if (!createdMs || Date.now() - createdMs > STATE_TTL_MS) {
    return fail('Link expired', 'Please start the connection again from 46 Advance.');
  }
  const uid = stateData.uid;

  try {
    await enforceRateLimit(db, ['googleAuthCallback', uid], 10);
  } catch {
    return fail('Too many attempts', 'Please wait a moment and try connecting again.', 429);
  }

  try {
    const { tokens } = await oauthClient().getToken(code);
    const email = emailFromIdToken(tokens.id_token);
    const now = FieldValue.serverTimestamp();

    const tokenDoc: Record<string, unknown> = {
      accessToken: tokens.access_token ?? null,
      accessTokenExpiry: tokens.expiry_date ?? null,
      updatedAt: now,
    };
    if (tokens.refresh_token) tokenDoc.refreshToken = tokens.refresh_token;

    await Promise.all([
      db.collection('googleConnections').doc(uid).set(
        {
          connected: true,
          email,
          scopes: tokens.scope ? tokens.scope.split(' ') : SCOPES,
          connectedAt: now,
          updatedAt: now,
        },
        { merge: true },
      ),
      db.collection('googleTokens').doc(uid).set(tokenDoc, { merge: true }),
    ]);

    const script = `<script>try{window.opener&&window.opener.postMessage('${GOOGLE_CONNECTED_MESSAGE}','*')}catch(e){}setTimeout(function(){window.close()},1800)</script>`;
    res
      .status(200)
      .send(
        htmlPage(
          '46 Advance — Google',
          'Google connected',
          `${email ? `Connected as <b>${escapeHtml(email)}</b>. ` : ''}You can close this window.`,
          script,
        ),
      );
  } catch {
    fail('Connection failed', 'Could not complete Google sign-in. Please try again.', 500);
  }
});

/**
 * Disconnect the caller's Google account: best-effort token revocation, then delete
 * `googleConnections/{uid}` and `googleTokens/{uid}`.
 */
export const googleDisconnect = onCall({ secrets: OAUTH_SECRETS }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  assertApproved(request.auth.token);
  const uid = request.auth.uid;
  const db = getFirestore();
  await enforceRateLimit(db, ['googleDisconnect', uid], 10);

  const tokenSnap = await db.collection('googleTokens').doc(uid).get();
  const t = tokenSnap.data() as { refreshToken?: string | null; accessToken?: string | null } | undefined;
  const revokeTarget = t?.refreshToken ?? t?.accessToken ?? null;
  if (revokeTarget) {
    try {
      await oauthClient().revokeToken(revokeTarget);
    } catch {
      // best-effort: the token may already be invalid
    }
  }
  await Promise.all([
    db.collection('googleConnections').doc(uid).delete(),
    db.collection('googleTokens').doc(uid).delete(),
  ]);
  return { ok: true };
});

/**
 * Create (or return) the event's Google calendar. Admin or the event's production
 * manager only. Input: { eventId }. Returns { calendarId }.
 */
export const createEventCalendar = onCall({ secrets: OAUTH_SECRETS }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId } = parseCallableData(createEventCalendarInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['createEventCalendar', uid], 20);
  await assertCanEditEvent(db, token, uid, eventId);

  const eventSnap = await db.doc(`events/${eventId}`).get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');

  const client = await authedClientForUser(db, uid);
  const calendarId = await ensureEventCalendar(db, client, uid, eventId, String(eventSnap.data()?.name ?? 'Event'));
  return { calendarId };
});

/**
 * Create a Google Calendar event with a Meet link for an advance call, on the event's
 * (auto-created) calendar, and write the Meet URL + time back to the advance. Admin or
 * the event's production manager only. Input: { eventId, stageId, advanceId, startMillis,
 * durationMinutes? }. Returns { link, calendarId, calendarEventId }.
 */
export const createAdvanceCall = onCall({ secrets: OAUTH_SECRETS }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const input = parseCallableData(createAdvanceCallInputSchema, request.data);
  const { eventId, stageId, advanceId, startMillis } = input;
  const durationMinutes = input.durationMinutes && input.durationMinutes > 0 ? input.durationMinutes : 30;
  const db = getFirestore();
  await enforceRateLimit(db, ['createAdvanceCall', uid], 20);
  await assertCanEditEvent(db, token, uid, eventId);

  const advanceRef = db.doc(`events/${eventId}/stages/${stageId}/advances/${advanceId}`);
  const [eventSnap, advanceSnap] = await Promise.all([db.doc(`events/${eventId}`).get(), advanceRef.get()]);
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
  if (!advanceSnap.exists) throw new HttpsError('not-found', 'Advance not found.');

  const client = await authedClientForUser(db, uid);
  const calendarId = await ensureEventCalendar(db, client, uid, eventId, String(eventSnap.data()?.name ?? 'Event'));

  const artistName = String(advanceSnap.data()?.artistName ?? 'Artist');
  const start = new Date(startMillis);
  const end = new Date(startMillis + durationMinutes * 60 * 1000);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const inserted = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 1,
    requestBody: {
      summary: `Advance call — ${artistName}`,
      start: { dateTime: start.toISOString(), timeZone: TIME_ZONE },
      end: { dateTime: end.toISOString(), timeZone: TIME_ZONE },
      conferenceData: { createRequest: { requestId: `advance-${advanceId}-${startMillis}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    },
  });

  const link =
    inserted.data.hangoutLink ??
    inserted.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
    null;

  await advanceRef.set(
    {
      advanceCallAt: Timestamp.fromMillis(startMillis),
      advanceCallLink: link,
      googleCalendarEventId: inserted.data.id ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { link, calendarId, calendarEventId: inserted.data.id ?? null };
});
