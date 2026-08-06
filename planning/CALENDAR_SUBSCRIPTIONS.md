# Calendar Subscriptions — Feature Spec

> **Status:** PROPOSED (drafted 2026-08-06). Not started. Supersedes the "org-owned, one
> calendar per event/festival" decision in [`ROADMAP.md`](ROADMAP.md) § Decisions (Q&A round 2)
> and answers the open question at ROADMAP § Open questions — *"Calendar: which dates/events
> flow to app-specific calendars; one calendar per event/festival or global?"* → **global, one
> per-user feed.**
>
> Behavior decisions (digest default, past-event persistence + hide toggle, Meet handling,
> delete-all-existing-calendars) confirmed 2026-08-06. One open question remains — digest body
> detail — and it does not block Phase 1.

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

Chosen over the alternative (one Google calendar *per person*, ACL-shared, with only their
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

A subscribed calendar is polled by the client, not pushed to. Apple Calendar's refresh is
user-configurable down to 5 minutes. **Google Calendar polls external ICS feeds on its own
schedule, commonly many hours**, and that is not controllable from our end. Anyone consuming
the feed in Google Calendar will see stale data on show day. This is the real cost of the
design and should be stated plainly in the Settings UI next to the feed URL.

## Behavior decisions

| Question | Decision |
| --- | --- |
| Default event set | **All events the user is a member of**, included automatically. New events appear without any action. |
| Default render mode | **Digest** (one all-day event per event-day) for every event. |
| Individual items | **Opt-in, per event.** |
| Opting out of an event | Supported, per event. |
| Past events | **Persist indefinitely** by default; an optional per-user "hide past events" toggle drops them. See below. |
| Advance calls / Meet links | **Not in the feed.** Booked via a Google Appointment Schedule page; Google delivers them. The app only tracks them. See below. |
| `pushToCalendar: false` items | Still excluded, in both modes. The flag keeps its current meaning; no data-model change. |

### Past events persist (per 2026-08-06 direction)

The feed applies **no date window**. The only gate is membership: as long as the user still has
an `events/{eventId}/members/{uid}` doc, that event's days keep being emitted, including days
years in the past, and the subscriber's calendar keeps showing them.

The corollary is deliberate and worth being explicit about: **when membership is revoked, that
event's history disappears from their calendar** on the next refresh. An ICS subscription is a
mirror — the client deletes any VEVENT the feed stops emitting. This is the security-correct
behavior (access follows current membership, not historical), and it is the reason the
membership re-check happens at generation time rather than only at subscribe time.

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
wired to `AdvanceCallPanel.tsx:55` — is the *only* advance-call code that writes to a per-event
calendar. It is a supported fallback (ROADMAP § Q&A round 3 chose "both"), but not the workflow
in use. Phase 3 repoints it at `primary`, which also unifies the semantics of
`advance.googleCalendarEventId` to always mean "an event on someone's primary calendar."
Retiring it outright is also an option if the booking flow plus the store-an-existing-link path
(11a) cover every case.

Attendees are a non-issue: the booking page sets them, so the app never needs to. (For the
record, `createAdvanceCall` sets no `attendees` and sends no invitation emails — that path
produces a calendar entry for its creator only. Irrelevant to the booking workflow, but worth
knowing before anyone leans on it.)

> **Trap to avoid in Phase 3.** `bestEffortDeleteCalendarEvents` (`google.ts:362-394`) deletes
> `advance.googleCalendarEventId` from the **event** calendar (`:370-371`). For a
> booking-attached advance that id lives on a **primary** calendar, so the delete 404s and is
> swallowed (`:386`) — deleting an advance silently does *not* cancel the artist's booked
> meeting. That is the behavior we want, but it is currently an accident of the id mismatch.
> Once advance-call ids consistently point at primary calendars, a well-intentioned "fix" to
> the calendar targeting would start **cancelling real artist bookings**. Booking-sourced
> events must be explicitly excluded from cascade deletion.

**This is what makes the per-event calendars fully redundant.** Schedule items move to the
feed; advance calls already live on primary calendars via the booking flow. Nothing is left.

## Data model

Two new collections. Neither exists today — there is no per-user preferences doc in the app at
all (`users/{uid}` is `allow write: if false`, and theme lives in `localStorage`).

**`calendarFeeds/{token}`** — the subscription credential. Doc id **is** the token, so lookup
is a single `get` with no query and no index.

```ts
{ uid: string; createdAt: Timestamp; lastAccessedAt: Timestamp | null; revokedAt: Timestamp | null }
```

Rules: `allow read, write: if false` (server-only, like `googleTokens`).

**`calendarSubscriptions/{uid}`** — the preferences. Every field defaults to empty/false and the
doc itself is optional, so a missing doc means "all my events, digest, keep history" and no
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

Rules: owner read **and owner write**. Owner-write is safe here because the security gate is
the membership re-check at generation time, not this doc — listing an event id you aren't a
member of accomplishes nothing, since the generator filters by membership regardless.

No changes to `events`, `scheduleDays`, or `members`.

## The endpoint

`GET https://us-central1-advancethat.cloudfunctions.net/calendarFeed?token=<token>` —
an `onRequest` function, public (calendar clients cannot authenticate).

1. Reject non-`GET`.
2. `calendarFeeds/{token}` → uid; 404 on missing or revoked.
3. Rate-limit per token, reusing `enforceRateLimit` from `lib/security/firestoreRateLimit.ts`.
4. `collectionGroup('members').where('uid','==',uid)` → the user's event ids. **The required
   index already exists** — it's the sole entry in `firestore.indexes.json:3-9`.
5. Subtract `excludedEventIds`; load those event docs and their `scheduleDays`.
6. Render per event: digest unless the event is in `itemModeEventIds`.
7. Return `text/calendar; charset=utf-8` with `Cache-Control: private, max-age=300`.

### Rendering

Calendar headers: `X-WR-CALNAME:46 Advance`, plus `REFRESH-INTERVAL;VALUE=DURATION:PT15M` and
`X-PUBLISHED-TTL:PT15M` to hint the poll rate (Apple Calendar honors these).

**Digest mode** — one all-day VEVENT per event-day:

```
UID:day-<eventId>-<dateKey>@46advance.com
DTSTART;VALUE=DATE:20260815
DTEND;VALUE=DATE:20260816
SUMMARY:BOTB — Show Day
DESCRIPTION:8:00 AM  Crew Call\n9:00 AM  Ashley McBryde — Truck Dump\n12:00 PM  Lunch\n…
```

`SUMMARY` uses `shortCode` + `ScheduleDay.title` when set, else the day-type label. Untimed
items (`startTime === null`) **are** listed in the digest body — they're currently invisible to
the calendar push entirely, and the digest is a natural place to surface them.

**Item mode** — one timed VEVENT per schedule item, `UID:sched-<itemId>@46advance.com`, matching
today's push output. Untimed items are omitted, as they are today.

Stable UIDs are what let a client update in place instead of duplicating. Note that flipping an
event between modes changes every UID in it, so the client swaps one all-day event for N timed
ones — correct, but a visible churn worth expecting.

Times are emitted as UTC instants (`…Z`), converting the stored wall-clock + event timezone via
the existing `zonedInputToDate` helper, which avoids embedding `VTIMEZONE`. Digest events use
`VALUE=DATE` and are timezone-free by definition.

### Shared code to extract

`{artist_N}` / `{artist_b_N}` placeholder resolution currently lives inside
`functions/src/googleSchedule.ts` (`resolvePlaceholders`, `orderedStageIds`, `loadSlotArtists`,
lines 62-120). The feed needs identical output, so this must be **extracted into a shared lib**
rather than duplicated — otherwise the two renderers drift and the same item reads differently
depending on which path produced it.

`pwa/src/lib/calendar/ics.ts` has working RFC 5545 escaping and UTC formatting but is
client-side and single-event. Its primitives move server-side and grow multi-VEVENT +
`VALUE=DATE` support; the existing `downloadIcs` path for advance calls stays as-is.

## Security

- **Token is a bearer credential in a URL.** 256-bit crypto-random, base64url. Rotatable and
  revocable from Settings.
- **Never log the full token.** Cloud Functions logs request URLs — log a prefix or hash only.
- **Membership re-checked on every generation**, not cached from subscribe time. This is what
  makes revocation effective (and what causes past events to disappear on removal, per above).
- Rate-limit per token to blunt scraping of a leaked URL.
- New public unauthenticated surface — worth a `/security-review` pass before it ships.

## Phases

**Phase 1 — the feed (replaces manual sharing).** `calendarFeeds` collection + token
create/rotate callables; the `calendarFeed` endpoint; digest renderer; extract the placeholder
resolver into shared lib; Settings card with the feed URL, copy button, rotate action, and the
Google-Calendar refresh-latency caveat. Ships with **all your events, digest mode, no picker**
— that alone replaces the manual share step. Runs alongside the existing push; nothing is
removed yet.

**Phase 2 — per-user selection.** `calendarSubscriptions` collection + rules; item-mode
renderer; Settings UI listing the user's events with an include/exclude toggle, a digest/items
toggle per event, and the "hide past events" switch.

**Phase 3 — decommission per-event calendars.** Repoint `createAdvanceCall` at the creator's
`primary` calendar (or retire it — see *Advance calls* above), and exclude booking-sourced
events from cascade deletion per the trap noted there. Then retire `ensureEventCalendar`,
`renameEventCalendarOnChange`, `reconcileScheduleDay`, `removeScheduleCalendarEvent`, the
client-side sync orchestration in `EventScheduleScreen.tsx` /
`ImportScheduleTemplatePanel.tsx`, and the `googleCalendarId` / `googleCalendarOwnerUid`
fields. **The booking sync (`googleBookings.ts`) is not touched** — it reads `primary`.

**Phase 3 cleanup — deleting the existing calendars.** Every calendar created to date is a test
artifact or is about to be superseded, so all of them get deleted (confirmed 2026-08-06).

> **Sequencing matters: do not delete before Phase 1 ships and subscribers have moved over.**
> Those calendars are what the team is subscribed to right now. Deleting them first leaves
> everyone with no schedule at all until the feed exists.

Deletion needs the **owner's** OAuth token — these are secondary calendars inside personal
Google accounts, so neither ADC nor the Drive service account can see them. Two workable paths:

- **By hand** (recommended for a handful): the owner deletes them in Google Calendar's web UI.
  Fastest, no code, no prod credentials.
- **One-off script** (`scripts/delete-event-calendars.ts`) if the count is large: follow the
  existing `scripts/migrate-*.ts` pattern — ADC + the `GOOGLE_CLOUD_PROJECT` /
  `CONFIRM_PROJECT` destructive-run guard — reading `googleTokens/{ownerUid}` to build an
  authed client per owner, then `calendars.delete` per `events/{id}.googleCalendarId`, clearing
  the field as it goes. Deleting a calendar deletes its events irreversibly, so it should
  support a dry-run listing pass first.

Roughly two to three PRs. Nothing here is architecturally risky — the schedule data model
already carries everything the feed needs.

## Hardening backlog

- **Generation cost.** Every poll re-reads all of a user's `scheduleDays`. A user on 5 events ×
  10 days is ~50 doc reads per poll; at a 5-minute refresh that's ~14k reads/user/day. Real but
  small at current scale (order of a few dollars a month for a 20-person team). The fix, if
  needed: a per-event `scheduleVersion` counter bumped by a Firestore trigger, so the ETag can
  be computed from event docs alone and unchanged feeds return `304` without reading any days.
  **Measure before building this.**
- **Feed size** if many events are switched to item mode. The Phase 2 "hide past events" toggle
  is the escape hatch; a finer-grained "hide events older than N months" is the next step if one
  toggle proves too blunt.
- **No delivery guarantee.** If a client stops polling, we have no signal. Consider surfacing
  `lastAccessedAt` in the Settings card so a subscriber can tell their calendar app has gone
  stale.

## Open questions

1. Should the digest body include crew lines (`(12) Stagehands · 8h`) and item `fields`, or only
   time + item name? Leaning time + item name + stage, with `description` on its own line —
   readable in a calendar popover, which a full field dump is not.

### Resolved 2026-08-06

- **Attendees on advance-call Meet events** → moot. Advance calls are booked through a Google
  Appointment Schedule page, which sets attendees and delivers the invite itself. The app only
  tracks them, and the existing booking sync reads `primary`, so it is unaffected by this work.
- **Three identical "BOTB — Boots on the Bend 2026 — South Bend, IN" calendars** → test
  artifacts from repeated event creation. Not a bug in `ensureEventCalendar`. All existing
  calendars get deleted in the Phase 3 cleanup, so no further diagnosis is needed. Duplicate
  *event docs* from that testing may still exist and would produce duplicate feed entries —
  worth a look during Phase 1 QA.
- **Past events** → persist by default; optional per-user "hide past events" toggle in Phase 2.
