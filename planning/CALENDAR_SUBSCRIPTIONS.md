# Calendar Subscriptions — Feature Spec

> **Status:** IN PROGRESS. Phases 1, 1b, and 2 shipped + deployed 2026-08-07 (#244/#246;
> token-logging runbook + alerting executed — see `DEPLOYMENTS.md`), plus the custom-domain
> feed URL (#249). Phase 3 (decommission per-event calendars) not started and gated on the
> cutover checklist below. Supersedes the "org-owned, one
> calendar per event/festival" decision in [`ROADMAP.md`](ROADMAP.md) § Decisions (Q&A round 2)
> and answers the open question at ROADMAP § Open questions — _"Calendar: which dates/events
> flow to app-specific calendars; one calendar per event/festival or global?"_ → **global, one
> per-user feed.**
>
> Behavior decisions (digest default/body, past-event persistence + hide toggle, Meet handling,
> retiring the app-created Meet fallback, and delete-all-existing-calendars) confirmed
> 2026-08-06. The security, cutover, protocol, and test gates below are part of the feature —
> not a post-launch hardening pass.

## Goal

Replace the current per-event Google calendar + manual sharing with **one subscription per
person**, named "46 Advance", that carries every event they're on. Each subscriber controls
which of their events appear and, per event, whether the day shows as a single all-day digest
(the default) or as individual timed items (opt-in).

## Why the current design can't get there

Two findings from the code audit drive the whole design.

**1. There is no sharing code.** The backend makes exactly these Google Calendar calls:
`calendars.insert` / `.patch` / `.delete` and the `events.*` family. There is **no
`acl.insert` anywhere**. Each per-event calendar is created inside the personal Google account
of whoever first triggered it (`events/{id}.googleCalendarOwnerUid`, set in
`functions/src/google.ts:196-210`), and every subscriber today got access because a human
shared it by hand in the Google Calendar web UI. So this is not a change to how sharing works
— it's building the sharing mechanism that was never built.

**2. Google Calendar sharing has no per-recipient filtering.** Access is granted to a whole
calendar. A single "46 Advance" calendar shared with a stagehand shows them every event on it.
There is no ACL, scope, or API that filters a shared calendar per recipient. "One calendar,
each user picks their events" is therefore **impossible via Google Calendar sharing** and
possible only by generating a distinct feed per user.

## Decision

**A per-user iCalendar (ICS) subscription feed**, served by a Cloud Function, generated from
Firestore at request time and filtered to the requesting user's membership and preferences.

Chosen over the alternative (one Google calendar _per person_, ACL-shared, with only their
events pushed into it) because that alternative needs ACL code that doesn't exist, multiplies
every schedule write by the subscriber count, hits calendar-creation quota, and would park N
calendars inside an admin's personal Google account — the same ownership fragility that already
forced the `deleteUser` cleanup path at `functions/src/index.ts:440-460`.

### What this buys beyond the feature itself

The feed has **no write amplification**: no reconcile, no orphaned events, no per-item
`googleCalendarEventId`, no cleanup on delete. That retires a documented class of production
bugs — the best-effort cleanup gap and the show-day 504s from rate-limit contention in
[`pwa/docs/ISSUES_LOG.md`](../pwa/docs/ISSUES_LOG.md) — rather than working around them.

### Accepted trade-off: refresh latency

A subscribed calendar is polled by the client, not pushed to. Apple Calendar exposes a
user-controlled auto-refresh setting. **Google Calendar polls external ICS feeds on its own
schedule, commonly many hours**, and neither its interval nor any delivery SLA is controllable
from our end. `REFRESH-INTERVAL` is a standards-based _hint_, not an instruction clients must
honor. Anyone consuming the feed in Google Calendar should assume stale data on show day. This
is the real cost of the design and must be stated plainly in the Settings UI next to the feed
setup instructions.

## Behavior decisions

| Question                      | Decision                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default event set             | **All events the user is a member of**, included automatically. New events appear without any action.                                                                           |
| Default render mode           | **Digest** (one all-day event per event-day) for every event.                                                                                                                   |
| Individual items              | **Opt-in, per event.**                                                                                                                                                          |
| Opting out of an event        | Supported, per event.                                                                                                                                                           |
| Past events                   | **Persist indefinitely** by default; an optional per-user "hide past events" toggle drops them. See below.                                                                      |
| Advance calls / Meet links    | **Not in the feed.** Booked via a Google Appointment Schedule page; Google delivers them. The app only tracks them. See below.                                                  |
| `pushToCalendar: false` items | Still excluded, in both modes. The flag keeps its current meaning; no data-model change.                                                                                        |
| Digest contents               | **Time range + resolved item name + stage.** Untimed items appear in a separate section. Crew lines, arbitrary item fields, and freeform descriptions are omitted from Phase 1. |
| Busy/free behavior            | Digest VEVENTs are `TRANSP:TRANSPARENT`; timed item-mode VEVENTs remain opaque, matching today's pushed timed items.                                                            |

### Past events persist (per 2026-08-06 direction)

The feed applies **no date window**. The only gate is membership: as long as the user still has
an `events/{eventId}/members/{uid}` doc, that event's days keep being emitted, including days
years in the past, and the subscriber's calendar keeps showing them.

The corollary is deliberate and worth being explicit about: **when membership is revoked, the
feed stops returning that event immediately, and a conforming client removes it on a later
refresh.** This is eventual revocation, not guaranteed remote deletion: a client may refresh
hours later, stop polling, retain a cached copy, or let the user export it. Access therefore
follows current membership at the server boundary, but already-fetched calendar data cannot be
clawed back. The membership re-check still happens at generation time rather than only at
subscribe time.

Feed size is not a concern at the expected scale because digest is the default: an event with
10 days contributes 10 VEVENTs, so ~20 events/year is ~200 VEVENTs/year, on the order of a few
hundred KB. Item-mode events are heavier (~300 VEVENTs for a 10-day event) but are opt-in and
typically only the one or two shows a person is actively advancing.

**Optional "hide past events" toggle** (confirmed 2026-08-06). A per-subscription boolean,
**default off**, that drops events whose last schedule day is before today in the event's
timezone. Off by default because persistence is the desired behavior — completed and archived
shows keep their members, and their history stays on the calendar. The toggle exists for people
who'd rather keep a clean forward-looking calendar. Built in Phase 2 alongside the event picker.

Note that turning it on removes those VEVENTs from the subscriber's calendar app, and turning it
back off restores them on the next refresh — the feed is the source of truth, so nothing is lost
either way.

### Advance calls / Meet links (per 2026-08-06 direction)

**Advance calls are created outside the app, and the app's job is to track them — not to
create, edit, or redistribute them.** The real workflow: a Google Appointment Schedule booking
page is shared with artists, the artist picks a slot and submits, and Google creates the
meeting, mints the Meet link, and puts it on the invitees' calendars. Delivery is entirely
Google's, and it already works. **Advance calls are therefore excluded from the feed and are
not mirrored onto any app-managed calendar.**

The app already implements exactly this, and it is **untouched by this project**. The header of
`functions/src/googleBookings.ts:1-17` documents the same flow, and the sync reads
`calendarId: 'primary'` (`:333`) — the connecting user's own calendar, never a per-event
calendar. `syncAdvanceCallBookings` (manual) and `scheduledAdvanceCallSync` (cron, 2h/4h)
match bookings to advances by normalized artist name, auto-attach unambiguous matches, and
queue the rest in `events/{id}/callBookings` for review via `BookedCallsPanel`. Attaching
writes `advanceCallAt` / `advanceCallLink` / `googleCalendarEventId` back onto the advance
(`googleBookings.ts:252-254, 486-488`).

**Consequence: retiring per-event calendars does not touch the booking path at all.** It reads
`primary`. No migration, no changes.

`createAdvanceCall` (`functions/src/google.ts:438-512`) — the app-creates-the-Meet path, still
wired to `AdvanceCallPanel.tsx:55` — is the _only_ advance-call code that writes to a per-event
calendar. It is not the workflow in use and is retired in Phase 3. Repointing it at `primary`
would require durable source + owner metadata: both this path and booking attachment currently
write only `advance.googleCalendarEventId`, so a later cascade cannot tell whether an event is
app-created or booking-owned, whose primary calendar owns it, or whether deletion is permitted.
It would also fail when PM A creates a call and PM B later tries to delete it with PM B's OAuth
token. Retiring the fallback matches the stated product boundary — the app tracks booked calls,
it does not create or cancel them — and avoids that ownership model entirely.

Attendees are a non-issue: the booking page sets them, so the app never needs to. (For the
record, `createAdvanceCall` sets no `attendees` and sends no invitation emails — that path
produces a calendar entry for its creator only. Irrelevant to the booking workflow, but worth
knowing before anyone leans on it.)

> **Trap to avoid in Phase 3.** `bestEffortDeleteCalendarEvents` (`google.ts:362-394`) deletes
> `advance.googleCalendarEventId` from the **event** calendar (`:370-371`). For a
> booking-attached advance that id lives on a **primary** calendar, so the delete 404s and is
> swallowed (`:386`) — deleting an advance silently does _not_ cancel the artist's booked
> meeting. That is the behavior we want, but it is currently an accident of the id mismatch.
> Phase 3 removes this cascade for advance/stage deletion; it must never be "fixed" to target
> `primary`, because that would start **cancelling real artist bookings**. Existing future calls
> created by the retiring fallback must instead be found during the pre-delete inventory and
> handled explicitly before their event calendars are removed.

**This is what makes the per-event calendars fully redundant.** Schedule items move to the
feed; advance calls already live on primary calendars via the booking flow. Nothing is left.

## Data model

Three new server-managed collections. None exists today — there is no per-user preferences doc
in the app at all (`users/{uid}` is `allow write: if false`, and theme lives in `localStorage`).

**`calendarFeeds/{tokenHash}`** — the subscription credential lookup. Generate a 256-bit
crypto-random base64url token, return the raw token to the user once, and store only
`sha256(token)` as the document id. Hashing the presented token still gives the endpoint a
single `get` with no query or index while avoiding a recoverable bearer secret at rest.

```ts
{
  uid: string;
  createdAt: Timestamp;
  lastAccessedAt: Timestamp | null;
  revokedAt: Timestamp | null;
}
```

**`calendarFeedOwners/{uid}`** — the one-active-feed pointer used by the authenticated
create/rotate callables.

```ts
{
  activeTokenHash: string;
  createdAt: Timestamp;
  rotatedAt: Timestamp | null;
}
```

Create and rotate run transactionally: revoke the previous token doc when present, create the
new token doc, and update the UID pointer. A user has at most one active feed. The full URL is
shown only on create/rotate; a later Settings visit shows active/recently-accessed status and
offers rotation. Rotation requires a confirmation explaining that the existing calendar stops
updating and the new URL must be subscribed to again. `setUserApproved(false)` revokes the
active token, and `deleteUser` revokes it and removes the owner pointer; the endpoint's
authoritative user check remains the fail-closed backstop if either cleanup is interrupted.

**`calendarSubscriptions/{uid}`** — the preferences. Every field defaults to empty/false and
the doc itself is optional, so a missing doc means "all my events, digest, keep history" and no
backfill is ever needed as events are created.

```ts
{
  /** Events rendered as individual timed items instead of the default digest. */
  itemModeEventIds: string[];
  /** Events the user has opted out of entirely. */
  excludedEventIds: string[];
  /** Drop events whose last schedule day is past. Default false — history persists. */
  hidePastEvents: boolean;
  updatedAt: Timestamp;
}
```

Rules: owner read; all writes go through an authenticated `updateCalendarSubscription`
callable. Its shared Zod contract uses an exact field allowlist, arrays of bounded strings,
at most 250 ids per array, ids between 1 and 128 characters, deduplication, and server-owned
`updatedAt`. `excludedEventIds` wins if an id appears in both arrays. Membership remains the
confidentiality gate — listing an event id you are not a member of never grants access — while
server validation prevents malformed or oversized preferences from becoming an availability
problem.

Every new collection is `allow write: if false`; `calendarFeeds` and `calendarFeedOwners` also
deny client reads. No Phase 1/2 changes to `events`, `scheduleDays`, or `members`. Phase 3 does
remove the legacy calendar linkage fields described in its cleanup inventory.

## The endpoint

`GET https://46advance.com/calendar-feed?token=<token>` — a Firebase Hosting rewrite
(shipped 2026-08-07) proxying to the `calendarFeed` `onRequest` function; the direct
`https://us-central1-advancethat.cloudfunctions.net/calendarFeed` URL remains valid for
URLs minted before the switch. Public because calendar clients cannot authenticate. Reject non-`GET`
methods with `405` and an `Allow` header (`HEAD` joins the allowed set in Phase 1b).

Steps marked **[1b]** are the conditional-request/telemetry layer and ship in Phase 1b; the
feed is correct and usable without them.

1. Validate the token as an unpadded 43-character base64url value, hash it, and read
   `calendarFeeds/{sha256(token)}`. Return the same `404` for missing, revoked, malformed, or
   inactive credentials.
2. Load the authoritative `users/{uid}` record and fail closed if it is missing or revoked.
   Membership alone is insufficient: `setUserApproved(false)` does not remove membership docs,
   so a token would otherwise outlive account revocation. Token create/rotate callables use the
   same active-user gate.
3. Apply a generous client-compatible per-token cost limit with
   `checkFirestoreRateLimit`, keyed by `tokenHash` rather than the secret. Do **not** reuse
   `enforceRateLimit`: that wrapper throws a callable `HttpsError`, while an `onRequest` handler
   must return its own `429` + `Retry-After` response.
4. Read `calendarSubscriptions/{uid}` and
   `collectionGroup('members').where('uid','==',uid)` to obtain the user's event ids. **The
   membership index already exists** — it is the sole entry in `firestore.indexes.json:3-9`.
5. Subtract `excludedEventIds`; load those event docs and their `scheduleDays`. Load ordered
   stages and advances once per event, then resolve every day's artist placeholders in memory —
   do not repeat the current per-day/per-stage reads for a whole feed.
6. Render per event: digest unless the event is in `itemModeEventIds`.
7. **[1b]** Compute a content ETag, honor `If-None-Match`, and return `304` when the generated
   body is unchanged. This saves transfer/client churn but does not avoid Firestore reads; the
   later `scheduleVersion` optimization is what can do that.
8. **[1b]** Best-effort update `lastAccessedAt` at most once per 24 hours. It is
   migration/diagnostic evidence, not a per-poll write and not proof that a client retained or
   displayed the feed.
9. Return `text/calendar; charset=utf-8` with `Cache-Control: private, max-age=300`,
   `X-Content-Type-Options: nosniff`, and `X-Robots-Tag: noindex, nofollow`. **[1b]** A `HEAD`
   response returns identical status/headers without the body.

### Rendering

The serializer emits CRLF-delimited RFC 5545 content and UTF-8-aware folds every content line
at 75 octets without splitting a multi-byte code point. Required/base calendar properties:

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//46 Entertainment//46 Advance Calendar Feed//EN
CALSCALE:GREGORIAN
X-WR-CALNAME:46 Advance
REFRESH-INTERVAL;VALUE=DURATION:PT15M
X-PUBLISHED-TTL:PT15M
```

`REFRESH-INTERVAL` is the standards-based suggested minimum. `X-PUBLISHED-TTL` is retained as
a compatibility hint; neither is a delivery guarantee.

> **The 15-minute hint and the 5-minute `Cache-Control: max-age=300` differ deliberately — do
> not "align" them.** They govern different layers, and the HTTP cache lifetime is deliberately
> held *below* the suggested refresh interval so a client honoring the hint always receives
> freshly generated content rather than a cached body. The short `max-age` also caps how hard an
> aggressively-polling client can hit the function. Raising it to `900` would let a 15-minute
> poll return a body up to 15 minutes stale — the exact failure this ordering prevents. If the
> refresh hint changes, `max-age` must stay strictly lower.

**Digest mode** — one all-day VEVENT per event-day:

```
UID:day-<eventId>-<dateKey>@46advance.com
DTSTAMP:20260806T180000Z
LAST-MODIFIED:20260806T180000Z
DTSTART;VALUE=DATE:20260815
DTEND;VALUE=DATE:20260816
TRANSP:TRANSPARENT
SUMMARY:BOTB — Show Day
DESCRIPTION:8:00–9:00 AM · Crew Call · Main Stage\n9:00–10:00 AM · Ashley McBryde — Truck Dump · Main Stage\n…\nUntimed\nLunch
```

`SUMMARY` uses `shortCode` (or event name) + `ScheduleDay.title` when set, else the day-type
label. The body is deliberately calendar-sized and bearer-URL-safe: time range + resolved item
name + stage, with `pushToCalendar !== false` untimed items in a final `Untimed` section. Phase 1
omits crew lines, arbitrary item `fields`, and freeform descriptions.

**Item mode** — one timed VEVENT per schedule item,
`UID:sched-<eventId>-<itemId>@46advance.com`, matching today's push output except that the event
id makes global uniqueness explicit even if malformed/legacy client data repeats an item id.
Untimed items are omitted, as they are today; timed items remain opaque/busy.

Stable UIDs are what let a client update in place instead of duplicating. Note that flipping an
event between modes changes every UID in it, so the client swaps one all-day event for N timed
ones — correct, but a visible churn worth expecting.

Every VEVENT includes `UID`, `DTSTAMP`, and `LAST-MODIFIED`; timestamps derive from the latest
relevant event/day source timestamp so an unchanged poll does not make every item look newly
modified. Times are emitted as UTC instants (`…Z`), converting the stored wall-clock + event
timezone via the existing `zonedInputToDate` helper, which avoids embedding `VTIMEZONE`.
Digest events use `VALUE=DATE` and are timezone-free by definition.

### Shared code to extract

`{artist_N}` / `{artist_b_N}` placeholder resolution currently lives inside
`functions/src/googleSchedule.ts` (`resolvePlaceholders`, `orderedStageIds`, `loadSlotArtists`).
The feed needs identical output, so extract the pure resolver and shared lineup-loading logic
rather than duplicate them. The feed-facing loader should preload an event's ordered stages and
advances once and build day-aware lookup maps in memory; extracting the current per-day I/O shape
unchanged would undercount reads and scale poorly across a full historical feed.

`pwa/src/lib/calendar/ics.ts` has useful RFC 5545 text escaping, CRLF joining, and UTC formatting
but is client-side, single-event, and does not fold long lines. Move/grow its primitives
server-side for multi-VEVENT + `VALUE=DATE` support, globally unique UIDs, deterministic update
metadata, and UTF-8 line folding. The existing `downloadIcs` path for stored advance-call links
stays as-is.

## Security

- **Token is a bearer credential in a URL.** 256-bit crypto-random, base64url. Rotatable and
  revocable from Settings; only its SHA-256 digest is stored. The full URL is shown only at
  creation/rotation.
- **Never application-log the full token, request URL, or raw query object.** Application log
  discipline cannot redact infrastructure request logs if the platform records URLs, so Phase 1
  must verify the deployed log shape and restrict/exclude retention and access accordingly.
  Moving the token from query to path would not solve URL logging.
- **Active account and membership are re-checked on every generation.** A missing/revoked user
  fails closed even if memberships remain; removed event memberships disappear from future feed
  responses. Neither can guarantee deletion of copies already cached by an external client.
- Per-token rate limiting is cost/availability control, not confidentiality protection: one
  successful request is enough to copy the full feed. Rotation is the response to a leaked URL.
- Preferences are schema/size bounded server-side, and Phase 1's digest minimizes arbitrary
  freeform data exposed through a bearer URL.
- New public unauthenticated surface — complete a security review before shipping Phase 1.

## Phases

**Phase 1 — the feed (runs alongside manual sharing).** `calendarFeeds` +
`calendarFeedOwners`; active-user-gated create/rotate callables and shared contracts; the public
`calendarFeed` endpoint (`GET`, token validation, active-user gate, per-token rate limit with
explicit `429` + `Retry-After`, security headers); digest renderer including UTF-8 folding,
`TRANSP`, stable UIDs and deterministic update metadata; shared/preloaded placeholder
resolution; rules and endpoint/renderer tests; and a Settings card that creates and displays the
URL once, warns before rotation, gives Apple/Google subscription instructions, and states the
Google refresh-latency caveat. Ships with **all your events, digest mode, no picker**. The
existing push remains active until the cutover gates pass; merely deploying Phase 1 does not
replace the calendars people already use.

**Phase 1b — conditional requests and access telemetry.** ETag + `If-None-Match` → `304`;
`HEAD` support (and adding it to the `Allow` header); throttled `lastAccessedAt` writes; the
Settings card's recent-access line; and the operational alerting in the hardening backlog.

Split out because none of it changes what a subscriber sees — the Phase 1 feed is complete and
correct without it — while all of it is easier to size against real traffic. Getting Phase 1 in
front of real subscribers sooner is what surfaces actual Apple/Google refresh behavior, which no
amount of local testing reveals.

> **Phase 1b is required before the Phase 3 cutover, not optional polish.** Cutover gate 1
> depends on `lastAccessedAt` as its evidence that a real client polled. Deferring 1b
> indefinitely would leave that gate unverifiable.

**Phase 2 — per-user selection.** `calendarSubscriptions`; validated
`updateCalendarSubscription` callable + shared contract; item-mode renderer; rules tests; and
Settings UI listing the user's events with an include/exclude toggle, a digest/items toggle per
event, and the "hide past events" switch.

**Phase 3 — decommission per-event calendars.** Retire `createAdvanceCall` and its UI path;
stop cascade deletion from attempting to manage `advance.googleCalendarEventId`; then retire
`ensureEventCalendar`, `renameEventCalendarOnChange`, `reconcileScheduleDay`,
`removeScheduleCalendarEvent`, and all client-side sync/removal orchestration. The Appointment
Schedule booking sync is retained unchanged — it reads `primary` and only tracks bookings.

Phase 3's complete code/data inventory includes:

- `events.googleCalendarId` / `googleCalendarOwnerUid` and event-update rule locks;
- embedded `scheduleDays.items[].googleCalendarEventId`, parsers, input preservation, writeback,
  callable contracts, and emulator/unit tests (either migrate the stale fields away or document
  tolerant legacy reads before removing parser support);
- `EventScheduleScreen`, `ImportScheduleTemplatePanel`, schedule-day delete helpers, and calendar
  sync status/copy;
- `AdvanceCallPanel`'s app-created Meet action while preserving the store-link/download-ICS path;
- Settings, Event Form help text, landing-page copy, Privacy Policy, CHANGELOG, and architecture
  documentation that currently promise per-event calendar creation;
- Google OAuth least-privilege reassessment. Once secondary-calendar creation and app-created
  meetings are gone, verify whether the broad `calendar` / write scopes can be reduced to the
  read access required by booking sync; document any re-consent/migration requirement;
- shared backend callable exports/contracts. The native app has no code yet, but its future
  contract surface must not inherit retired callables.

### Cutover gates (required before Phase 3 cleanup)

Do not use "Phase 1 deployed" as the cleanup signal. All of these must be true:

1. Every intended subscriber has an active feed and has confirmed subscription in their target
   client; a recent `lastAccessedAt` confirms at least one real poll. (Requires Phase 1b — this
   gate is unverifiable until access telemetry ships.)
2. Apple Calendar and Google Calendar QA has covered initial add, changed content, removed
   content, mode changes, membership revocation, token rotation, and an empty feed. Record the
   observed refresh behavior without treating it as a guaranteed SLA.
3. The existing calendars have been inventoried for manual/unmatched entries, future events,
   and conference/Meet data. Any future call created by the retiring fallback is explicitly
   migrated, retained elsewhere, or cancelled by its owner; it must not disappear accidentally.
4. Unexpected/manual content has been exported or resolved, the team has stopped relying on the
   old calendars, and schedule pushing has been disabled by the Phase 3 code change.
5. A human reviews the dry-run inventory and explicitly confirms the destructive cleanup.

#### Gate evidence log (append as QA happens)

**2026-08-08 — first real subscriber (owner), Google Calendar.**

- **Gate 1 (partial).** The owner has an active feed and confirmed it populates correctly in
  Google Calendar. `lastAccessedAt` recorded a real fetch 31s after the mint, and Cloud Run
  `request_count` metrics (unaffected by the request-log exclusion) show further successful
  fetches afterwards. **Still open:** every OTHER intended subscriber. Only one uid has ever
  created a feed, so the rest of the team is not yet covered.
- **Gate 2 (partial).** Covered so far: **initial add** (Google, populates correctly) and
  **token rotation** (three mints, each revoking its predecessor, exactly one active; polls
  against a revoked token return the standard 404). **Observed refresh behavior — NOT an
  SLA:** successful polls at roughly 22:xx, 23:xx ×2, 00:xx, then **~09:xx — a ~9-hour gap**,
  consistent with the "commonly many hours" warning above. Do not plan show-day changes
  around Google refresh. **Still open:** Apple Calendar entirely; changed content, removed
  content, mode changes, membership revocation, and an empty feed on both clients.
- **Note on reading the telemetry.** `lastAccessedAt` is throttled to one write per 24h, so
  the Settings card can legitimately show a stamp hours older than the newest poll. Cloud Run
  `request_count` is the per-request signal when the actual cadence matters.
- **Watch item.** Recurring 404s appeared at ~03/04/06/10:xx, well outside the manual probe
  windows. Metrics carry no token label, so attribution is impossible; the likely cause is a
  stale client subscription still polling a rotated-away URL (harmless but never updating).
  Ordinary scanning of the public path is the alternative explanation. Re-check once the team
  is subscribed — a persistent 404 poller usually means someone's calendar is silently dead.

**Phase 3 cleanup — deleting the existing calendars.** Every calendar created to date is a test
artifact or is about to be superseded, so all of them get deleted (confirmed 2026-08-06).

> **Sequencing matters: do not delete until every cutover gate above passes.** Those calendars
> are what the team is subscribed to right now. Deleting them early leaves everyone with no
> schedule and can also destroy a future app-created Meet event stored only there.

Deletion needs the **owner's** OAuth token — these are secondary calendars inside personal
Google accounts, so neither ADC nor the Drive service account can see them. Two workable paths:

- **By hand** (recommended for a handful _after the inventory_): the owner exports anything the
  inventory says to retain, then deletes the confirmed calendars in Google Calendar's web UI.
- **One-off script** (`scripts/delete-event-calendars.ts`) if the count is large: follow the
  existing `scripts/migrate-*.ts` pattern — ADC + the `GOOGLE_CLOUD_PROJECT` /
  `CONFIRM_PROJECT` destructive-run guard — reading `googleTokens/{ownerUid}` to build an
  authed client per owner (including the OAuth client secrets needed to refresh tokens), then
  `calendars.delete` per `events/{id}.googleCalendarId`. Dry-run is the default and lists owner,
  calendar, total/future event counts, conference-bearing events, and entries not represented by
  known stored calendar ids. The destructive run treats Google `404`/`410` as idempotent success
  and clears Firestore references only after the calendar is confirmed absent.

Plan on four reviewable code PRs (feed, conditional-requests/telemetry, preferences,
decommission) plus a separately confirmed
operational cleanup. The schedule model already carries the feed content, but the public bearer
endpoint, eventual external-client behavior, OAuth-scope transition, and irreversible cleanup
are real risks addressed by the gates above.

## Verification and acceptance tests

**Renderer unit tests**

- Required VCALENDAR/VEVENT properties, CRLF output, RFC text escaping, Unicode, and UTF-8
  75-octet line folding.
- Stable/globally unique UIDs, deterministic `DTSTAMP`/`LAST-MODIFIED`, and unchanged-body ETags.
- DST boundaries, `nextDay`, overnight end times, default duration, all-day non-inclusive
  `DTEND`, and invalid/missing times.
- Digest ordering and compact body, untimed section, transparent digest behavior, opaque timed
  items, `pushToCalendar: false`, and mode switching.
- `{artist_N}` / `{artist_b_N}` day-aware resolution across ordered stages, including fallback
  labels and an event with no stages/advances.

**Endpoint/emulator tests**

- `GET`, `405`, missing/malformed/revoked token, inactive or deleted user, and an empty
  valid calendar.
- Membership add/remove, preference exclusion/precedence, missing preference defaults, and
  direct cross-user access denial.
- Explicit `429` + `Retry-After`, and error paths that never log the raw token.
- **[1b]** `HEAD` parity with `GET` status/headers, conditional `304` on `If-None-Match`, and
  throttled `lastAccessedAt` writes.
- Create/rotate transaction cardinality and immediate invalidation of the old token.

**Rules/client acceptance**

- Rules tests for owner reads, denied direct writes, and server-only token collections; callable
  tests for the shared contract's validation limits.
- Real Apple/Google subscriptions: add, poll, update in place without duplicates, remove, switch
  modes, revoke membership/account/token, and rotate/re-subscribe.
- Cleanup dry-run fixture proving unknown/manual and conference-bearing entries are surfaced and
  a repeated destructive run is idempotent.

## Hardening backlog

- **Generation cost.** Every poll reads a feed token, authoritative user, preferences,
  memberships, event docs, schedule days, and the stages/advances needed for placeholder
  resolution; the simple "50 schedule docs" estimate is therefore a lower bound. Phase 1
  preloads stage/advance data once per event and measures reads, duration, response size, and
  error rate. If needed, add a per-event `scheduleVersion` counter bumped by trusted writes or a
  Firestore trigger so an ETag can be computed from event summaries and unchanged feeds can
  return `304` without reading every day. **Measure before building this.**
- **Feed size** if many events are switched to item mode. The Phase 2 "hide past events" toggle
  is the escape hatch; a finer-grained "hide events older than N months" is the next step if one
  toggle proves too blunt.
- **No delivery guarantee.** `lastAccessedAt` is surfaced from Phase 1b and proves only that a
  request occurred. There is no signal that the client retained/displayed the response or will
  keep polling.
- **Public endpoint operations.** Alerting on error/latency/response-size anomalies without token
  logging ships with Phase 1b. Revisit per-token limits, function concurrency/max-instances, and
  revoked-token TTL cleanup after real traffic exists.

## Resolved decisions (2026-08-06)

- **Digest body** → time range + resolved item name + stage; untimed items in a final section.
  Omit crew lines, arbitrary fields, and freeform descriptions in Phase 1. Digest VEVENTs are
  transparent; item-mode timed VEVENTs remain opaque.
- **App-created Meet fallback** → retire `createAdvanceCall` in Phase 3 rather than move it to a
  user's primary calendar. Appointment Schedule bookings remain externally owned and tracked.
- **Feed credential storage** → one active 256-bit token per user, SHA-256 digest at rest, full
  URL shown only on creation/rotation, explicit re-subscribe warning on rotation.
- **Attendees on advance-call Meet events** → moot. Advance calls are booked through a Google
  Appointment Schedule page, which sets attendees and delivers the invite itself. The app only
  tracks them, and the existing booking sync reads `primary`, so it is unaffected by this work.
- **Three identical "BOTB — Boots on the Bend 2026 — South Bend, IN" calendars** → test
  artifacts from repeated event creation. Not a bug in `ensureEventCalendar`. All existing
  calendars get deleted in the Phase 3 cleanup, so no further diagnosis is needed. Duplicate
  _event docs_ from that testing may still exist and would produce duplicate feed entries —
  worth a look during Phase 1 QA.
- **Past events** → persist by default; optional per-user "hide past events" toggle in Phase 2.
