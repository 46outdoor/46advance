# Deployment & rollback ledger

Lightweight release traceability for 46 Advance (WS-M / forensic-remediation Phase 3). This
records **what shipped, from which commit, and how to roll it back**. It is not automation —
it is the human-readable record that complements the machine release identifier.

**Division of labor vs. the changelog:** this ledger records *deploy events* — target, commit,
verification evidence, rollback — on the deploy clock. What a change *does* for its users lives
in [`../CHANGELOG.md`](../CHANGELOG.md), on the merge clock. Entries here **cite** PRs and let
the changelog carry the description; don't re-narrate features in both places. (The two clocks
differ because Hosting is owner-deployed on its own cadence — merged ≠ live.)

## Release identifier (every build)

Every production build exposes a source commit/release id:

- `pwa/vite.config.ts` resolves `APP_RELEASE` from `VITE_APP_RELEASE` if set, else the short git
  SHA (`git rev-parse --short HEAD`), else `dev`.
- It is defined into the bundle as `import.meta.env.VITE_APP_RELEASE` and read by
  `src/lib/sentry.ts` as the Sentry `release`, so every captured event correlates to the exact
  build. Source-map upload uses the same `release.name` (inert until the Sentry token is set).

To identify a running build: check the Sentry release, or the `VITE_APP_RELEASE` value baked at
build time.

## Deploy targets and who deploys them

| Target | How | Who |
| --- | --- | --- |
| **Hosting (PWA client)** | Owner-operated `production-deploy.yml` workflow only | Owner — **agents never deploy Hosting** |
| **Cloud Functions** | `pwa/scripts/cli/firebase-safe.sh deploy --only functions` after the secret health check + explicit confirmation | Owner or authorized agent |
| **Firestore/Storage rules** | `firebase-safe.sh deploy --only firestore:rules` (or `storage`) after rules tests + explicit confirmation | Owner or authorized agent |

Backend deploys log in as the Firebase owner account (`jared@yourstagemanager.com`). Restrictive
rules that depend on a live client follow the gated order in the remediation plan
(`archive/fix/FORENSIC_REMEDIATION_PLAN.md` § Cross-cutting rule 7): additive Function → verified
Hosting release → restrictive rules.

## Rollback

- **Hosting:** re-run the owner Hosting workflow from the previous good commit (or use the
  Firebase Hosting release-rollback in the console). The PWA's stale-chunk recovery
  (`src/lib/pwa/recovery.ts`) self-heals clients holding old dynamically-imported chunks.
- **Functions:** redeploy from the previous good commit (`git checkout <sha> -- pwa/functions`
  then deploy, or deploy the whole prior commit). Functions are designed idempotent, so a
  redeploy is safe.
- **Rules:** rules are versioned in git; redeploy the previous `firestore.rules` / `storage.rules`.
  Prefer widening (permissive) rollbacks — never leave data more exposed than intended.

## Open deploy actions

The standing queue — everything decided-but-not-yet-live or gated on a future release. Keep
this section current: it is the *only* forward-looking part of this file. When an item
completes, record it as a ledger entry below and delete it here.

- **Three production checks the 2026-08-10 releases could not cover.** The release is verified
  (see its ledger entry) but the hand-verification used a `tech` account, which cannot exercise
  any of these. None is suspected broken — all three are covered by CI — this is about closing
  the gap between "CI says so" and "someone looked".
  1. **The director's contacts curation.** The rules went live earlier and were verified against
     the released ruleset, but the Edit/Delete controls on a contact someone else created only
     appeared with this release. Needs the `jared@yourstagemanager.com` director session:
     confirm they can correct another person's directory entry, and that **relinking is still
     refused** (`createdBy`/`userId` stay admin-only — that is the F-3 guard).
  2. **The admin inline nav row at exactly 880px.** This is the case that *wrapped* on Linux CI
     at the old 800px breakpoint — most items, pending badge, longest email. A tech account has
     four items and cannot reproduce it. Open the owner's admin session at an 880px-wide window
     and confirm the header stays on one line.
  3. **Chronological event ordering** (added with the `abc2400` release). The tech account sees
     one event; ordering needs at least two. Confirm the events list leads with the soonest show,
     and that an event with no start date sorts to the bottom rather than the top.
- **Weak credential on the test account.** `jared@jaredfoh.com` (tech on Boots on the Bend) was
  created 2026-08-10 as the app's first non-oversight account and its password was shared in
  chat. Worth keeping — it is the only way to exercise the non-oversight path by hand, and the
  class of bug it caught (see the slug fix) is invisible to every other account. **Change the
  password.**
- *(the Phase-3 field-migration re-run gate closed 2026-08-08 with a clean dry run; see the
  ledger entry)*

## Ledger

Newest first — prose entries, **one per deploy event**, following this template:

> **YYYY-MM-DD — Title (#PR, `sha`): TARGET(S).** What deployed — cite the CHANGELOG entry for
> user-facing behavior rather than describing it. Verification evidence. **Rollback:** steps.

A dated **decision record** may also be entered when it closes an observation thread whose
evidence must outlive the Open-actions queue (which is deleted as items complete) — the deploy
it gates still gets its own entry when it happens.

Record backend deploys and Hosting checkpoints. Client-only PRs ship on the next Hosting
release; note the checkpoint that carried them once known. (The table at the bottom is the
**closed record** of the 2026-07-22 → 2026-08-03 deploys, from the remediation era's format —
don't extend it; new entries are prose.)

**2026-08-19 — DECISION RECORD: the CSP enforce observation window is closed, clean.** No
deploy — this closes the observation thread opened by the 2026-08-08 21:08Z enforce flip. The
residual log watch was scoped "through ~2026-08-12"; it is reviewed here across the **full
enforced period** (flip → 2026-08-19, ~11 days) rather than the original window.

**Zero CSP violations.** The ongoing-monitoring query recorded with the flip entry, widened to
`--freshness=12d` to span the whole period, returned no rows.

A null result from a log query is worthless without proof the query works, so the zero was
controlled:

| Check | Result |
| --- | --- |
| Violation query, `--freshness=12d` | **0 entries** |
| Control — any `cspreport` log entry, 12d | rows returned (latest 2026-08-10T01:53Z, deploy NOTICE/INFO) |
| Control — any `cspreport` log entry, 90d | same rows; resource labels + service name confirmed correct |
| `GET https://…/cspReport` | **405** — collector deployed and reachable |
| `46advance.com` response headers | `Content-Security-Policy` present; `…-Report-Only` absent |
| `advancethat.web.app` response headers | same |

The reachability check is the one that makes the zero mean anything: **"no violations reported"
and "the collector is dead" produce identical output.** GET→405 proves the function is live
without POSTing a synthetic violation into production logs — and since the handler is a
straight-line `logger.warn` (`functions/src/cspReport.ts`), a running function implies a working
log path.

**This evidence is recorded here because it expires.** `cspReport` logs violations and
**stores nothing**; Cloud Logging's `_Default` bucket retains 30 days, so the raw basis for
this entry ages out around **2026-09-07** and is not re-derivable after that.

**Enforcement is real but not complete** — unchanged from the flip entry: `script-src` still
carries `'unsafe-inline'` (`firebase.json`), so this is not full XSS protection. Nonce/hash
tightening remains a separate, unscheduled effort; closing this window does not close that.

**Rollback (unchanged):** rename the header key back to `Content-Security-Policy-Report-Only` +
owner Hosting redeploy, reverting the WS-I guard test
(`pwa/test/security-headers.config.test.ts`) in the same change so it can't land silently.

**2026-08-10 — Hosting release (`abc2400`): HOSTING (owner).** Second release of the day, ~32
minutes after the first. Carries the **chronological events list** (#285 — the list sorted
alphabetically by name, and because names embed the city that sorted a touring festival *by
city*) plus the mobile-nav plan archival (#283, docs only). See the CHANGELOG entry.

**Ordering is NOT verified in production.** The only non-oversight account (`jared@jaredfoh.com`)
is a member of exactly one event, and one event demonstrates nothing about sort order. What was
confirmed against this build is that the events list still loads and renders for that account —
a regression check on the read path the change touched, not a check of the fix. The ordering
itself rests on six unit tests, including one that sorts the same input in both directions to
catch a comparator that only handles one direction of the undated case. **Closing this needs an
account that sees more than one event** — it is folded into the open action above.

One implementation note worth keeping, because the obvious version of this change is a trap: the
oversight query still uses `orderBy('name')`, not `orderBy('startDate')`. Firestore's `orderBy`
silently excludes documents missing the field, so ordering the query by start date would drop
every undated event from the admin/director list entirely. Chronological order is applied
client-side over the whole page instead.

**Rollback:** re-run Hosting from `e0a5d542` — that reverts the sort while keeping the slug fix,
the nav disclosure, and the contacts-curation UI. No backend targets changed.

**2026-08-10 — Hosting release (`e0a5d542`): HOSTING (owner).** Carries three client changes
merged today, all previously unreleased: the **narrow-screen nav disclosure** (#279), the
**contacts-curation UI** that activates the already-live director rules (#279), and the
**slug-resolution fix** (#282) — see the CHANGELOG for each. Also the Admin pill's
`--color-accent-deep` contrast fix.

**The slug fix is the one that mattered.** Until this release, any approved user who was not an
admin or a production director got "Failed to load this event." on every event they opened,
including shows they were assigned to — the events list links by slug, and slug resolution was
denied for anyone whose access comes from membership rather than a global claim. It had gone
unnoticed because until 2026-08-10 every production account was admin or director; the app had
never had an ordinary crew member. Onboarding any crew was blocked. Full root cause in the PR
and in `IDEAS.md` § Findings (the entry is kept, including three refuted theories).

Verified in production immediately after the release, signed in as a **tech** on Boots on the
Bend (`jared@jaredfoh.com`, the first non-oversight account the app has had):

- `/events/botb-2026` — the slug the list actually links to, and the exact URL that failed
  before — **renders**, and is still rendered 15s later. The old failure was load-then-error,
  so a single check would have missed it.
- `/events/dyiAwDgUV8GL24t52Y9A` — canonicalizes to the slug URL **and stays rendered**. That
  redirect is what turned a working id URL into a broken one.
- `/events/rtc-ashland-26` — an event they are not on — reads "Event not found, or you don't
  have access.", held stable for 5s. Not a load failure.
- Narrow nav at 390px: trigger opens a single `Main navigation` landmark containing exactly
  Events / Settings / Sign out — no Contacts, Documents, Tracker or Admin. Rows 44px, brand
  link 48px, no horizontal overflow.
- 879px → disclosure; 880px → inline row, open panel cleared, four items at **0px vertical
  spread** (one line), no overflow.

**Not verified by hand** — carried into the Open-actions queue above: the director's contacts
curation, and the admin inline row at 880px (the case that wrapped on CI). Both are covered by
the emulator suite on Linux; neither was exercised in a real browser.

**Rollback:** re-run the owner Hosting workflow from `75ee240` to drop the slug fix only, or
from `47482ff` to drop all three client changes. The contacts **rules** are independent and
stay live either way — a rolled-back client simply stops offering the director's Edit/Delete
controls. No Functions changed.

**2026-08-10 — Production director gains contacts-directory curation (#279, `75ee240`):
FIRESTORE RULES.** Widens the `contacts/{contactId}` **update** and **delete** gates to include
`isProductionDirector()`, so a director may edit and delete any entry in the global directory
rather than only ones they created. See the CHANGELOG entry for the user-facing description.

**This is the first write the production-director capability has ever carried**, ending the
read-only property that was its central safety argument. The blast radius is the global
contacts directory only: every event write gate still ignores the claim, and the director
does **not** gain admin's relink power — `keysUnchanged(['createdBy','userId'])` still applies
to them, so the F-3 ownership-seizure guard holds and linking a contact to a user account
remains admin-only. `ROADMAP.md` §4 and the archived
`archive/feature/EVENT_OVERSIGHT_ROLE_PLAN.md` both carry the amendment rather than their
original "no writes" wording.

Verified against the **live released ruleset**, not just the deploy output: ruleset
`3b76b363-1283-4691-96ea-f47db7c6868e` fetched back from the Firebase Rules API confirms
`isProductionDirector()` present in the contacts update gate with the `keysUnchanged` guard
intact. (Note the Rules API answered this time; a 403 blocked the same check during the #274
deploy, which is why that entry fell back to behavioural verification.) Pre-deploy: 195 rules
tests including four new director cases — edit and delete another user's contact succeed,
relinking `createdBy`/`userId` fails, and a plain approved non-creator is still refused.

**Not yet observable to anyone.** The UI that exposes this (`canManageContact` driving the
Edit/Delete affordances) is client-side and ships on the next owner Hosting release; until
then the rules permit the write but nothing offers it. The same release carries the
narrow-screen nav disclosure from the same PR.

**Rollback:** revert the `contacts/{contactId}` update/delete gates to the pre-#279 form
(`isAdmin() || (isActiveUser() && (createdBy == uid || userId == uid) && keysUnchanged(...))`)
and redeploy `--only firestore:rules`. Independent of Hosting — the client tolerates the
narrower rule, it just surfaces controls that would be rejected.

**2026-08-10 — Production director ACTIVATED: first claim granted and verified in
production.** Granted at 02:15:19Z by `q2zpZHxJWpgfsrl3ZXK6oaTr5H83` (the app admin) to
`jared@yourstagemanager.com` / `ar63s3b84jdkvXjbRbMiskJe9Qo1` — an approved account that is
**not** admin, **not** organizer, and holds **zero event membership rows** (confirmed by a
collection-group query), so the capability is doing all the work rather than a membership
quietly standing in for it.

Grant integrity: the custom claim is on the Auth account itself
(`{"admin":false,"approved":true,"productionDirector":true}` — note `approved` survived, so
the setter's claim **merge** did not clobber the map), mirrored to `users/{uid}` with
`productionDirectorUpdatedAt` + `productionDirectorUpdatedBy`.

Behaviour verified by signing in as the director in an isolated browser context: lists **both**
events despite no memberships; **no** "New event" button (oversight is not authorship); opens
an unassigned event with **zero** mutation controls (no Edit / Add stage / Generate packet /
Save packet / Remove / Add slot / Sync now — and zero `<input>`/`<select>` on the entire page);
**Team & access** shows the roster with no add-by-email field, role select, or Add member
button; **Event Checklist** renders with no Import or add-item controls; **Tracker** loads and
rolls up both events (0/105 and 0/126 sections). Every request 200, zero console messages, no
permission-denied. Nav correctly omits **Admin**.

**Known at the time, since resolved:** the director's nav still showed **Contacts** and
**Documents** because the nav work was not yet built. It shipped later the same day
(`planning/archive/feature/PWA_MOBILE_NAV_PLAN.md`, released in `e0a5d542`) — and the decision
went the other way: the director is now *in* the `cross-event` set, so those destinations are
theirs deliberately rather than by omission. No exposure changed either way: `contacts` and
`artistDocuments` remain `allow read: if isActiveUser()` for everyone (tracked in IDEAS §5).

**2026-08-10 — Hosting checkpoint (02:02Z, `3c232bd` #275): HOSTING (owner) — the
production-director client is LIVE.** Carries the PWA half of #274 from the current `main`
tip, completing the three-target rollout begun with the Functions/rules deploy below. Verified
in production: **Admin → Users** shows the Production director column with its
scope-stating confirmation; the **Tracker** nav link renders for the admin; `/tracker` lists
both events with completion roll-ups and no "Load more" (2 events, under the 25-event page);
`syncUserClaims` and every Firestore channel returned 200; zero console messages.

**Operational note — the new UI does not appear until the service worker updates.** The PWA
ships `skipWaiting: false` with a `prompt` registration, so an already-open tab keeps serving
the previous bundle: immediately after this release the admin screen still showed the old
column set until the registration was cleared and the page hard-reloaded. Anyone who reports
"I don't see the Tracker link" should reload rather than be told the deploy failed.

Still dormant by design — no claim has been granted, so the lead/tech Tracker removal and the
oversight capability are both inert until the first grant. **Rollback:** redeploy the previous
Hosting release; the backend entry below rolls back independently.

**2026-08-10 — Production director: FUNCTIONS + RULES live (#274, `6d7d55b`): FUNCTIONS,
FIRESTORE RULES, STORAGE RULES.** The backend half of the cross-event oversight capability
(`planning/archive/feature/EVENT_OVERSIGHT_ROLE_PLAN.md`; ROADMAP §4 records it as the first deliberate
exception to the per-event RBAC model). Deployed in the plan's compatibility order —
Functions first, then rules. Functions: `syncUserClaims` now returns/mirrors
`isProductionDirector`, the new admin-only `setUserProductionDirector` callable (audit stamp +
structured log + refresh-token revocation on revoke) is registered, and `assertCanReadEvent`
gates the Drive broker. Rules: `canReadEvent` replaces all 15 event-subtree **read** gates and
the event Storage path; `canReadChecklist` adds oversight without exposing the checklist to
leads/techs; the members collection-group rule stays self-only. **No create/update/delete gate
changed** — the capability is read-only by construction.

**Nothing anyone can see has changed yet, by design.** No `productionDirector` claim has been
granted, so both branches are inert, and the PWA half is still unreleased.

Verified against production immediately after the rules release, with the **old** client still
being served — the intended old-client/new-backend compatibility case: `syncUserClaims`
returned 200 (the output schema's new field carries `.default(false)`, and the client never
parses output, so an added field cannot break an older bundle), every Firestore Listen channel
returned 200 with **no permission-denied**, and both events rendered. Pre-deploy: 536 client
unit, 191 rules (Firestore + Storage), 176 Functions unit, 137 Functions emulator, plus
typecheck/lint/arch — all green in CI.

**Rollback:** redeploy the previous `firestore.rules`/`storage.rules` **first** — that is the
instant kill switch, because a stale token asserting the claim stops mattering the moment the
rules stop honoring it — then patch the Functions `assertCanReadEvent` director branch (an
Admin-SDK path that client rules do not contain), then revoke claims. Revoking claims first is
the *planned-withdrawal* order and is too slow for an active exposure.

**2026-08-08 — Hosting checkpoint (21:08Z, `ecc5c9c` #266): HOSTING (owner) — CSP enforce is
LIVE.** Fourth owner release of the day, from the then-current `main` tip, carrying #264
(the CSP flip + guard test), #265 (this ledger's restructure), and #266. Verified: both
`46advance.com` and `advancethat.web.app` now serve `Content-Security-Policy` (enforced) with
no `…-Report-Only` header, and the first hour of cspReport logs shows zero violations. The
report-only phase that began 2026-07-24 is over; the residual few-day log watch is tracked in
Open deploy actions. **Rollback:** rename the header key back in `pwa/firebase.json` (and
revert the guard test, which forbids the report-only key) + owner Hosting redeploy.

**2026-08-08 — Phase-3 field-migration re-run gate: closed with a clean dry run (no
writes).** The Phase-3 entry below required one more `strip-legacy-calendar-fields.ts` pass
after the next Hosting release, in case the pre-Phase-3 client wrote
`googleCalendarEventId: null` back on a whole-day save. The 19:23Z checkpoint satisfied the
gate; the dry run (`DRY_RUN=1`, ADC) then reported **0 event docs and 0 schedule items** to
clear — the field never came back, so no destructive pass was needed. Nothing to roll back.

**2026-08-08 — Hosting checkpoint (19:23Z, `b660b40` #263): HOSTING (owner).** Third owner
release of the day (16:00Z `5f9079a`, 16:22Z `13cc50e`, 19:23Z `b660b40` — all successful
`production-deploy.yml` runs). The 19:23Z release is current `main` exactly, so the accumulated
client queue is **clear**: the calendar-feed Phase 2 picker (#252), the Phase-3
calendar-decommission client (#257), per-day schedule editing (#262), and the older client
halves (#229 #233 #234 #236 #238–#240 #243) are all live. Verified:
`Last-Modified: 2026-08-08 19:25:26 GMT` on `46advance.com`, after the 17:45Z merge of #263.
Consequences: the Phase-3 field-migration re-run gate is satisfied, and the CSP enforce flip
missed this release — both tracked in Open deploy actions.

**2026-08-08 — CSP report-only → enforce: decision record (#264, `feat/csp-enforce`) — no
deploy yet.** The flip is merged but **not live** (production still serves report-only; the
pending release is tracked in Open deploy actions, and the carrying Hosting checkpoint will be
the deploy entry). Closes the observation thread open since reporting went live 2026-07-24. Two
legitimate-origin gaps were found across the whole period, each fixed before enforcing:
`connect-src` missing `…cloudfunctions.net` (#185, live 2026-07-24) and `frame-src` missing the
Firebase Auth handler domain `advancethat.firebaseapp.com` (#208, live 2026-07-31) — the Auth
SDK mounts a hidden iframe at `https://<authDomain>/__/auth/iframe`, so enforcing without it
would have broken sign-in silently. The final window (2026-07-31 → 2026-08-08, queried at 9-day
freshness to cover it fully) returned **one** violation: the already-recorded pre-fix frame-src
event at `2026-07-31T03:10:25Z` — zero since the fix went live. Per this ledger's own warning
that a silent window only counts if the flows ran, Cloud Run request logs confirm the window was
exercised: sign-in (`syncuserclaims` ×22), packet generate/save (`generatepacket` /
`savepackettodrive`, 200s across 07-31 → 08-03), Drive picker token grants
(`getdriveaccesstoken` ×5), the OAuth disconnect/reconnect cycle (08-08 re-consent), and the
calendar-feed callables. Template push and quote PDF were not invoked but introduce no origin
not already proven by other callables. Nothing merged since 08-03 adds an origin (checklist =
Firestore; feed card = callables; fonts self-hosted). The flip renames the header key — value
unchanged — and repoints the WS-I guard test (`pwa/test/security-headers.config.test.ts`) at
the enforced key, asserting the report-only key is absent so a revert can't land silently. Note `script-src` still carries `'unsafe-inline'`, so enforcement is not full
XSS protection; nonce/hash tightening remains a separate effort. **Rollback:** rename the key
back to `Content-Security-Policy-Report-Only` + owner Hosting redeploy. Ongoing-monitoring
query (the window verification above ran it with `--freshness=9d` to reach back to 07-31;
widen `--freshness` to span whatever period is under review):

```bash
pwa/scripts/cli/gcloud-safe.sh logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="cspreport" AND jsonPayload.message="CSP violation"' \
  --limit=100 --freshness=7d \
  --format="value(timestamp,jsonPayload.violatedDirective,jsonPayload.blockedUri,jsonPayload.documentUri)"
```

**2026-08-08 — OAuth least privilege (#259, `1991c1e`): functions deploy.** Closes the last
Phase 3 inventory item. The backend's only remaining Calendar call is `events.list` on
`primary` (booking sync), so the grant narrowed from `calendar` + `calendar.events` to the
single read-only `calendar.events.readonly`. `include_granted_scopes: true` was removed at the
same time — incremental authorization re-grants every previously approved scope, which would
have silently restored calendar WRITE access on the next reconnect and defeated the reduction.
Secrets health check passed; deploy clean (no function deletions this round).

**Existing grants are NOT narrowed by this deploy.** A connected account keeps whatever it
previously approved until the user hits Settings → Disconnect → Connect (`disconnectGoogle`
calls `revokeToken`, so the cycle resets the grant at Google and re-consents to the new set).
Booking sync behaves identically under either grant, so no one is forced to act. Note this is
separate from rotating a calendar-feed token, which changes the feed URL and nothing about
OAuth.

**Owner re-consented 2026-08-08 15:52Z — reduction VERIFIED end to end.** Stored grant is now
exactly `calendar.events.readonly` + `drive.file` + `openid` + `userinfo.email`, with no
calendar write scope. Probed with the refreshed token: `events.list` on `primary` (the booking
sync's only call) returns **200**, and `events.insert` returns **403 refused**. This also
confirms dropping `include_granted_scopes` was load-bearing — with it, the previously approved
`calendar` / `calendar.events` would have been re-granted here. **Rollback:** redeploy functions
from `b79e7c2`; anyone who already re-consented must reconnect again to regain the wider scopes.

**2026-08-08 — Phase 3: per-event Google calendars decommissioned (#257, `b79e7c2`):
rules + functions deploy + data migration.** Rules deployed first (permissive — the events
update lock drops `googleCalendarId`). The functions deploy then ABORTED: Firebase refuses to
delete functions non-interactively. Five retired functions were deleted explicitly
(`createAdvanceCall`, `createEventCalendar`, `reconcileScheduleDay`,
`removeScheduleCalendarEvent`, `renameEventCalendarOnChange`) with owner approval, then the
deploy re-ran clean. Verified: the retired callables now return 404 while retained ones still
return 401.

**Sequencing note for next time:** the live frontend predated this merge and still called three
of the five. Impact was assessed as nil before deleting — `reconcileScheduleDay` and
`removeScheduleCalendarEvent` are fire-and-forget with client-side `.catch`, and
`createAdvanceCall` was already broken because both event calendars were gone from Google. The
tidier order is Hosting release first, backend removal second.

**Data migration** (`functions/scripts/strip-legacy-calendar-fields.ts`, run after the deploy —
running it earlier would have let the still-live `ensureEventCalendar` recreate the calendars):
cleared `googleCalendarId`/`googleCalendarOwnerUid` from 2 event docs and
`googleCalendarEventId` from 233 schedule items across 16 days. Each day rewrite is
transactional and bumps `revision`. Re-run confirmed idempotent (0 remaining). **Re-run once
more after the next Hosting release** — the pre-Phase-3 client carries item calendar ids across
a whole-day save and can write the key back as `null` (harmless; nothing reads it).
**Rollback:** redeploy functions from `e687249`; the cleared fields are not recoverable, and
are not needed — they referenced calendars deleted from Google before this work began.

**2026-08-08 — Calendar subscription feed Phase 2 (#252, `e687249`): rules + functions
deploy.** Per-user event selection and item mode. `deploy --only firestore:rules` released
the `calendarSubscriptions/{uid}` owner-read rule (all writes go through the callable);
`deploy --only functions` created `getCalendarSubscription` / `updateCalendarSubscription`
and updated `calendarFeed` to apply preferences (exclusions beat item mode;
`hidePastEvents` compares the event's last schedule day in the event's own timezone).
Secrets health check passed. Verified live: both new callables return `401` unauthenticated
against a `404` control, confirming deployment. Preferences default to all-events/digest/
keep-history with NO stored doc, so behavior is unchanged for everyone until they opt in.
**The Settings picker UI ships with the next owner Hosting release** — the backend is live
ahead of it, which is the additive-function → Hosting order this ledger prescribes.
**Rollback:** redeploy functions from the prior commit; the rules change is additive
(a new collection) and can stay.

**2026-08-07 — Calendar feed on the app domain (#249): Hosting checkpoint + functions
deploy.** The owner's Hosting release carried the `/calendar-feed` rewrite (verified live:
`https://46advance.com/calendar-feed?token=<dummy>` returns the function's plain 404, not the
SPA shell) and the SW navigation-denylist for the path; the functions deploy then flipped
minted URLs to `https://46advance.com/calendar-feed?...` — sequenced in that order so no mint
could 404. Earlier `cloudfunctions.net` URLs remain valid (verified both hosts answer). The
feed now rides Hosting's HSTS/security headers; `Cache-Control: private` keeps the CDN from
caching bearer content; the request-log exclusion is unaffected (same `calendarfeed` Run
service). **Rollback:** redeploy functions from the prior commit (mints revert to
cloudfunctions.net); the rewrite can stay — it is inert for URLs that don't use it.

**2026-08-07 — Calendar subscription feed Phase 1b (#246): functions deploy.** Conditional
requests + access telemetry on the feed endpoint: strong ETag / `If-None-Match` → `304`,
`HEAD` support (`Allow: GET, HEAD`), and best-effort `lastAccessedAt` stamping (≤1/24h per
token) surfaced on the Settings card — the poll evidence Phase 3's cutover gate 1 requires.
Rules unchanged. Secrets health check passed; live smoke confirmed `405` now advertises
`Allow: GET, HEAD` and `HEAD` reaches the credential gate. The ETag/304 path is
emulator-tested; first real-token verification lands when a subscriber's client polls (visible
as the card's last-fetched line). **Operational alerting (completed same day):** email
notification channel `Jared (email)` → `jared@46entertainment.com`
(`notificationChannels/8336736023506429777`) + two enabled policies on the `calendarfeed`
Cloud Run service — "calendarFeed — 5xx errors" (>5 server errors summed over 5 min;
`alertPolicies/4245228198232861314`) and "calendarFeed — slow generation (p95)" (p95 request
latency >10s sustained 15 min; `alertPolicies/12592066657550051159`). Built-in Run metrics
only — no URLs/tokens involved, unaffected by the request-log exclusion. **Rollback:**
redeploy functions from `2be460a`; delete the policies/channel with
`gcloud alpha monitoring policies delete <name>` / `gcloud beta monitoring channels delete <name>`.

**2026-08-07 — Calendar subscription feed Phase 1 (#244, `2be460a`): functions + rules deploy
and the token-logging runbook.** Secrets health check passed; `deploy --only functions` created
`calendarFeed` (public ICS endpoint, `https://us-central1-advancethat.cloudfunctions.net/calendarFeed`),
`createCalendarFeed`, `rotateCalendarFeed`, `getCalendarFeedStatus`, and updated the rest of the
fleet; `deploy --only firestore:rules` released the server-only `calendarFeeds` /
`calendarFeedOwners` rules. Endpoint smoke: well-formed dummy token → the designed 404. The owner
ran the Hosting deploy carrying the Settings card the same day.

**Token-logging runbook (archive/feature/CALENDAR_SUBSCRIPTIONS.md § Security — executed and verified).**
Confirmed empirically that Cloud Run request logs record the FULL feed URL including the bearer
token (`httpRequest.requestUrl` in `run.googleapis.com%2Frequests`). Mitigation (trade-off
approved 2026-08-07): exclusion `calendarfeed-request-urls` added to the `_Default` sink, filter
`resource.type="cloud_run_revision" AND resource.labels.service_name="calendarfeed" AND
log_name="projects/advancethat/logs/run.googleapis.com%2Frequests"`. `_Required` carries only
audit logs, so `_Default` was the sole route. Verified live after propagation: a post-exclusion
dummy-token probe produced **no** request-log entry. App-level structured logs (token hash
prefixes only, never the raw token/URL) are unaffected and remain the debugging surface. Two
pre-exclusion entries containing dummy tokens (`AAA…`/`BBB…`, never real credentials) age out
with the 30-day `_Default` retention. **Rollback:** `gcloud logging sinks update _Default
--remove-exclusions=calendarfeed-request-urls` restores platform request logging.

**2026-07-24 — Hosting checkpoint (second deploy; superseded — see the 2026-08-08 checkpoint
for current live state).** The owner ran a second Hosting deploy on
2026-07-24 carrying the accumulated client work: the festivals/event restructure client (Festivals
admin + event festival/location form, #192), the packet filename-token editor + version replace/bump
prompt (#194), the Sync-from-Drive/import error surfacing (#186 client), the packet buttons/PM-gating
(#188 client), **and the CSP `cloudfunctions.net` allowlist fix (#185)**. Verified live on both
`advancethat.web.app` and `46advance.com`: `content-security-policy-report-only` whose `connect-src`
now includes `…cloudfunctions.net`, plus `report-uri …/cspReport`, HSTS + nosniff. (Prior checkpoint:
run `30055170800` at `d6c60c5` (#178–#181), the quick-wins client release.)

Both `VITE_SENTRY_DSN` and `SENTRY_AUTH_TOKEN` are provisioned. Owner-provided Sentry evidence
confirmed the safe Admin → Observability diagnostic reached production Issues with a release tag and
a readable source-mapped frame (`ObservabilityDiagnostics.tsx:17:18`).

### Closed record — 2026-07-22 → 2026-08-03 (remediation-era format; don't extend)

| Date | Change | Commit / PR | Target | Result |
| --- | --- | --- | --- | --- |
| 2026-08-03 | **Schedule `{artist N}` fallback:** stage-less rows (all template imports) resolve against the event's FIRST stage in `reconcileScheduleDay`, so calendar pushes carry real artist names instead of generic slot labels. Resolution-only — stored rows keep `stageId: null` (write-back maps the fresh doc) | `0a1ee7f` #236 | FUNCTIONS (`reconcileScheduleDay` only) | deployed as owner; scoped update, verified complete. Pre-deploy: 426 unit + 109 emulator tests. Screen half of the same fix awaits the next Hosting release |
| 2026-08-03 | **Event Checklist rules:** two **additive** blocks — `events/{id}/checklist/{itemId}` (PM-only surface: `canEditEvent` required for READ as well as write, so dept-leads/techs can't see it; text + known-section shape gates) and top-level `checklistTemplates` (approved-user read, admin write). No Cloud Functions changes (the checklist is pure client CRUD + an empty-subcollection "blank at creation") | `8ffe032` #233 (rules also carry #234, client-only) | FIRESTORE RULES | deployed as owner; compiled + released clean. Pre-deploy: 426 unit + rules suites incl. 7 new checklist cases (PM read/write, non-PM READ denied, shape + template gates). **Client half (Event Checklist panel + Checklist-templates admin, plus the #234 lineup slot-count fix) awaits the next Hosting release** |
| 2026-08-03 | **Team & access RBAC:** new `assignEventMember`/`removeEventMember` callables (PM-or-admin via `assertCanEditEvent`, add-by-email, approved-target gate, no self-changes so an event keeps ≥1 PM, `ifAbsent` for the crew tech auto-enroll) + **additive** dept-scoped rules branch (`members.departments` lets a department-lead write only their departments' `content`/`sections` on advances + stage production records). Member docs denormalize `email`/`displayName` (creator seeds too) | `6eddf70` #229 | FUNCTIONS + FIRESTORE RULES | deployed as owner; both callables **created** + fleet updated, rules compiled + released clean. Pre-deploy: 413 unit + 151 rules (7 new dept-scoped) + 109 emulator (15 new callable) tests. Rules change is additive (widens dept-lead writes only), so no Hosting gate needed. **Client half (Team & access panel, crew auto-enroll, per-dept gating) awaits the next Hosting release** — the callables are inert until then. Follow-up: `scripts/backfill-member-display.ts` owner-run 2026-08-03 (dry-run then apply; 1 legacy member row backfilled with email/displayName, 0 skipped/orphaned) so pre-#229 rows show names, not uids (#231) |
| 2026-08-03 | **Full-fleet redeploy for the `firebase-functions` 7.3.0 → 7.3.2 runtime bump** (#224; #225 rode along client-side). A dependency bump touches every function, so fleet-wide is correct here — unlike the feature deploys, which stay scoped | `9f2cdb7` #224 | FUNCTIONS (all 39) | deployed as owner; pre-deploy: secrets health + build + 146 unit + 94 emulator tests on the bumped runtime. Post-deploy: all 39 `ACTIVE`, secrets health passed after the fleet-wide restart, `cspReport` POST→204 live |
| 2026-07-31 | **Festival logo uploads unblocked.** `storage.rules` gains a `festivals/**` block (read: active user, write/delete: admin), mirroring `templates`/`branding`. The festivals feature shipped an admin logo uploader with no matching rule, and Storage denies by default — so every festival-logo upload 403'd and no festival logo could ever be set | `68f9f59` #216 | STORAGE RULES | deployed as owner; compiled + released clean. Covered by 4 new rules tests, verified failing without the block. **This was the root cause** of events falling back to a stale template logo |
| 2026-07-31 | Packet logos: `generatePacket` sniffs image magic bytes before embedding (the renderer takes PNG/JPEG only, and a WebP saved as `.png` decoded to nothing and was silently dropped), falls back to the logo's other variant, logs the offending **path**, and returns non-fatal `warnings` so a degraded packet no longer looks identical to a correct one | `68f9f59` #216 | FUNCTIONS | deployed as owner (`generatePacket` only); verified `ACTIVE`, secrets health passed before and after. Client half (upload format validation + the warning UI) awaits the next Hosting release |
| 2026-07-31 | **Packet 400 fix.** `generatePacket` + `savePacketToDrive` accept a **null** `version`. The callable client encodes an explicitly-`undefined` property as `null` (`if (data == null)` — loose equality), and the schemas said `.optional()`, which rejects null → `invalid-argument` → HTTP 400. Broke "Generate packet" from 2026-07-24 (#194) and first-ever "Save packet to Drive" | `ae85568` #212 · `7de3af1` #214 | FUNCTIONS | deployed as owner (both functions); verified `ACTIVE`, secrets health passed before and after. Handlers unchanged — both already read the value with a null-tolerant fallback. **Rule recorded in the shared contract header:** optional callable fields must be `.nullish()`, not `.optional()`, wherever a client can pass `undefined` |
| 2026-07-31 | Accumulated client release: master-template default picker + per-section "bring over" checkboxes (#203), default-flag exclusivity hardening (#204), push-to-existing-events panel (#206), sign-in false "pending approval" flash fix (#209), **CSP `frame-src` Auth handler domain (#208)** | `af3e715` #203 #204 #206 #208 #209 | HOSTING | deployed by owner; verified live on **both** domains — `frame-src` now lists `…firebaseapp.com` on `advancethat.web.app` and `46advance.com` (still report-only), and `post-deploy-smoke.sh` passed on both (app shell + assets + security headers). Clears CSP prerequisite 2; **fresh enforce observation window opens 2026-07-31** |
| 2026-07-31 | Push a template's production content onto events that already exist: new `pushTemplateProduction` callable (admin-only, rate-limited; one `dryRun`-flagged handler serves both preview and apply, merge writes only the keys the template carries, stages matched by name and never created) | `9385f4b` #206 | FUNCTIONS | deployed as owner (`pushTemplateProduction` only — a new callable; the `asArray` extraction that also touched `index.ts`/`scheduleTemplateSeed.ts` is byte-identical, so the existing fleet needed no redeploy); verified **created** + `ACTIVE`, nodejs22, `run.invoker: allUsers` matching the other callables, secrets health passed before and after. **Inert until the client ships** — nothing calls it until the next Hosting release |
| 2026-07-31 | Master house package: `createEventFromTemplate` takes an optional `include` selection (production / stages / departments / members / logo / schedule), always writes the creator's PM membership, and records the source `templateId` on the event | `4e1cd63` #203 | FUNCTIONS | deployed as owner (`createEventFromTemplate` only — every changed helper is called solely by it); verified `ACTIVE`, nodejs22, and the secrets health check passed both before and after. **Client half awaits the next Hosting release** — and must not ship before this deploy, or the "Bring over" checkboxes would render while the old callable silently ignored `include` |
| 2026-07-24 | Packet frame 46 mark: use the bundled compact `46/` brand mark (was the wide `46 / ENTERTAINMENT` branding lockup, illegible in the frame slot). Packet render no longer reads `config/branding` | `eda3750` #199 | FUNCTIONS | deployed as owner (`generatePacket` only); deploy complete. Server-side render is live |
| 2026-07-24 | Accumulated client release: festivals/event restructure UI (#192), packet filename-token editor + version replace/bump prompt (#194), Drive import/packet error surfacing (#186/#188 client), **CSP `cloudfunctions.net` allowlist (#185)** | `ffa8b69` #185 #186 #188 #192 #194 | HOSTING | deployed by owner (2nd 2026-07-24 deploy); verified live — `connect-src` now includes `…cloudfunctions.net` on both domains, still report-only. Clears the CSP-enforce prerequisite |
| 2026-07-24 | Packet cover + page-framing redesign (46 house design: full-bleed brand cover + festival logo + event identity; vector red frame + 46 mark on every page). Bundled default cover asset; per-festival cover override wired as an extension point | `3ee2c72` #196 | FUNCTIONS | deployed as owner (`generatePacket` only); deploy complete. Server-side render is live |
| 2026-07-24 | Packet filename tokens (`{festival}`/`{location}`/`{version}`, mm-dd-yy `{date}`, editable `{type}` label) + packet versioning (cover version, `{version}` token, `packetDrive.version`; save replace/bump) | `aed2ee4` #194 | FUNCTIONS | deployed as owner; deploy complete (`generatePacket` + `savePacketToDrive` updated). Client (admin token editor + replace/bump prompt) awaits the Hosting deploy |
| 2026-07-24 | Festivals managed entity (name + logo): `festivals/{id}` rule | `f3f1ebd` #191 | FIRESTORE RULES | deployed as owner; compiled + released clean (member read / admin write) |
| 2026-07-24 | Events reference a festival + location; create callables persist them; packet logo resolves the festival's mark | `f3f1ebd` #192 | FUNCTIONS | deployed as owner; deploy complete. Client (Festivals admin + event form) awaits the Hosting deploy |
| 2026-07-24 | Packets save into the event's linked Drive folder (user token, replace-existing), PM-only generate/save, cover date+time, `packetDrive` on the event | `e12f605` #188 | FUNCTIONS | deployed as owner; verified `savePacketToDrive` on OAUTH secrets (user-token path) + `generatePacket` fresh. Client (buttons/gating) awaits the Hosting deploy |
| 2026-07-24 | Drop the RESTRICTED `drive.metadata.readonly` scope: `importDriveFolder` now enumerates the configured library root via the docs-broker SA | `479244f` #186 | FUNCTIONS | deployed as owner; verified `importDriveFolder` secrets now `DRIVE_SA_KEY` (was OAUTH); `cspReport` re-verified reachable at the `report-uri` host |
| 2026-07-24 | Quick-wins client release + CSP `report-uri` header (reporting now active) | `d6c60c5` #178 #179 #180 #181 | HOSTING | deployed (run 30055170800); CSP report-only + `report-uri …/cspReport` verified live on `advancethat.web.app` and `46advance.com` |
| 2026-07-23 | Quick-wins batch: configurable packet filename (server-side naming) + CSP violation-report collector (`cspReport`) | `fdecd60` #179 · `90e7163` #180 | FUNCTIONS | deployed as owner; `cspReport` **created** (verified POST→204, GET→405, public invoker auto-set); `generatePacket` + all other fns updated OK |
| 2026-07-23 | S12 restrictive rules: server-owned slug/calendar fields, mandatory schedule revision, dismiss-only call bookings | `f0e45ea` #174 | FIRESTORE RULES | deployed after the Hosting gate; ruleset `ff74a9e8-fd22-4b91-8c49-c56ac2ec8629` |
| 2026-07-23 | S12 restrictive-rules client compatibility: revision-correct schedule re-date/shift/template writes | `f0e45ea` #174 | HOSTING | deployed (run 30042323489); build + runtime smoke passed |
| 2026-07-23 | Full accumulated client release through remediation closeout | `c14dc47` #173 | HOSTING | deployed (run 30039533073); source maps uploaded; runtime smoke passed; security headers live |
| 2026-07-23 | First post-S14/S17 client release | `20818f5` #172 | HOSTING | deployed (run 30039118806) |
| 2026-07-23 | Name-at-registration | `a2cc48c` #163 | HOSTING | deployed (run 30027436215) |
| 2026-07-22 | S12 transactional slugs + booking attach + schedule revision guard | #150 | FUNCTIONS + RULES | deployed; slug backfill owner-run (1 reserved, 0 dups) |
| 2026-07-22 | S10 recursive/cascade deletion | #148 | FUNCTIONS | deployed; callable invokers verified |
| 2026-07-22 | S11 event-zone date correction | #149 | FUNCTIONS | deployed |
| 2026-07-22 | S13 Google resilience, retention cron, redacted errors | #151 | FUNCTIONS | deployed (`scheduledDataRetention` created) |
