# Phase 11 — Google Calendar + Meet — execution plan

ROADMAP §12: **per-user Google OAuth**; **org-owned, one calendar per event**; push schedule
items; **advance calls** (create a Calendar event + Meet link, or store an existing link).

> **Status: 11a SHIPPED (#26). 11b BUILT on `feature/phase-11b-google-calendar` (2026-06-24)
> — pending secrets + deploy + end-to-end verification.** OAuth client created by the user;
> credentials go to Functions Secret Manager (`GOOGLE_OAUTH_CLIENT_ID` / `_SECRET`).
> Calendar ownership decision: the **connecting user owns** each event's calendar (per-user
> OAuth). Required Authorized redirect URI on the OAuth client:
> `https://us-central1-advancethat.cloudfunctions.net/googleAuthCallback`.

## Why the split
- **No structured schedule data exists yet.** The executed phases never built a schedule-item
  model (only free-text schedule fields in the audio/production registries). So "**push schedule
  items to the calendar**" has nothing structured to push — **deferred to a future Schedules
  phase** (ROADMAP §5).
- **The Google API automation is hard-blocked on external setup** only the user can do (OAuth
  client, consent screen, scopes, redirect URIs, secrets) and that can't be verified without.
  Building untested per-user-OAuth + token-refresh code blind is the wrong tradeoff.

So: ship the **verified, no-OAuth** slice (11a) now; build the **Google API** slice (11b)
against real credentials after setup.

## 11a — Advance call: store an existing link + .ics  [A — built]
The roadmap's decided **"store an existing link"** path, plus immediate offline calendar value.
- Advance gains: `advanceCallAt` (date/time) + `advanceCallLink` (existing Meet/Zoom URL).
  Rides the existing advance write gate (PM/admin) — **no rules change**.
- `src/lib/calendar/ics.ts` — **pure** iCalendar (VEVENT) builder + tests.
- UI on the advance detail: show the call time, a **Join** link, and **Add to calendar (.ics)**
  (pure client download — works with any calendar app, no Google account).

## 11b — Google API automation  [A — BUILT, pending deploy + verify]
- **Per-user OAuth** (offline access; refresh token stored server-side). Connect/disconnect UI.
- **Per-event calendar:** create on demand; store `googleCalendarId` on the event.

> **As built (2026-06-24).** Token storage is split because Firestore reads are not
> field-level: non-secret status in `googleConnections/{uid}` (owner/admin read), and
> refresh/access tokens in `googleTokens/{uid}` + single-use CSRF state in
> `googleOAuthStates/{id}` (both Admin-SDK-only, `allow read, write: if false`). The
> redirect URI uses the stable 2nd-gen alias `https://us-central1-advancethat.cloudfunctions.net/googleAuthCallback`
> (no hosting rewrite — hosting deploys are forbidden). Files: `functions/src/google.ts`,
> `src/lib/google/*`, `src/features/google/*` (Settings screen + `/settings` route),
> `AdvanceCallPanel.tsx`. Tests: 5 new rules tests for the Google collections.
- **Advance call → Google:** create a Calendar event **with a Meet link** (conferenceData) on
  the event calendar; write the resulting link back to `advanceCallLink`.
- Cloud Functions (googleapis): `googleAuthUrl`, `googleAuthCallback`, `googleDisconnect`,
  `createEventCalendar`, `createAdvanceCall`. Scopes: `calendar.events` + `calendar` (+ openid/email).
- Rules: `googleConnections/{uid}` — owner/admin read of *non-secret* status only; tokens
  written by Admin SDK, never client-readable. `event.googleCalendarId` rides the event write gate.

### External setup the USER must do before 11b (exact steps)
1. **Google Cloud console → APIs & Services → Enable APIs:** Google Calendar API.
2. **OAuth consent screen:** Internal (or External + test users); scopes `.../auth/calendar`
   and `.../auth/calendar.events`; app name "46 Advance".
3. **Credentials → Create OAuth client ID → Web application.**
   - **Authorized redirect URIs:** the `googleAuthCallback` function URL (provided after first
     deploy) **and** `https://46advance.com/...` if a web-redirect variant is used.
   - **Authorized JavaScript origins:** `https://46advance.com` (+ `http://localhost:4646` for dev).
4. **Provide the client ID + secret** → stored as Functions secrets
   (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`), never committed.
5. Confirm **46advance.com** (and any staging domain) are in Firebase Auth **authorized domains**.

Once provided, the agent builds 11b, deploys functions + rules, grants invoker, and verifies
end-to-end (connect Google → create an advance call → Meet link appears).

## Out of scope (later)
Schedule-item push (needs a Schedules phase) · two-way sync / reading existing calendars ·
Drive (separate phase) · mobile native OAuth (`expo-auth-session`).

## Exit criteria
- **11a:** on an advance, set a call time + link; Join works; .ics downloads and imports.
- **11b:** connect Google; "Create Meet for advance call" makes a calendar event with a Meet
  link on the event's org calendar; link saved back to the advance.
