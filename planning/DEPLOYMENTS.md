# Deployment & rollback ledger

Lightweight release traceability for 46 Advance (WS-M / forensic-remediation Phase 3). This
records **what shipped, from which commit, and how to roll it back**. It is not automation —
it is the human-readable record that complements the machine release identifier.

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

## Ledger

Newest first. Record backend deploys and Hosting checkpoints here. Client-only PRs ship on the
next Hosting release; note the Hosting checkpoint that carried them once known.

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

**Token-logging runbook (CALENDAR_SUBSCRIPTIONS.md § Security — executed and verified).**
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

**Hosting live state (verified 2026-07-24, second deploy).** The owner ran a second Hosting deploy on
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

### CSP: report-only → enforce (open thread)

Reporting went live with the 2026-07-24 Hosting release; violations now POST to the `cspReport`
function and land in Cloud Logging.

**PREREQUISITE — #185 (cloudfunctions.net allowlist) ✅ NOW LIVE (2026-07-24).** The Tier 1/2
observation found exactly one gap: the app's Cloud Functions callables (`…cloudfunctions.net/*`) were
missing from `connect-src`. The fix (PR #185) rode the 2026-07-24 owner Hosting deploy — verified live:
`connect-src` now lists `…cloudfunctions.net` on both domains. The known `cloudfunctions.net` violation
should now STOP appearing in the logs. **Next:** observe a clean window (~1 week, target ~2026-07-31) —
confirm no *other* legitimate-resource violations — then flip to enforce.

**PREREQUISITE 2 — `frame-src` missing the Auth handler domain ✅ NOW LIVE (2026-07-31).**
The observation window closed **not clean**. The `logging read` above returned exactly one violation
over the 7 days:

```
2026-07-31T03:10:25Z   frame-src   https://advancethat.firebaseapp.com   https://advancethat.web.app/
```

That origin is the **Firebase Auth handler domain** (`VITE_FIREBASE_AUTH_DOMAIN`); the Auth Web SDK
mounts a hidden iframe at `https://<authDomain>/__/auth/iframe` for popup/redirect sign-in. It matched
nothing in the old `frame-src` (`*.google.com` does **not** cover `firebaseapp.com`), so **flipping to
enforce before this fix would have broken Google/Apple sign-in in production** — and silently, since a
blocked auth iframe fails without a clear error. `frame-src` now lists the domain explicitly.

**The enforce clock restarts — window opened 2026-07-31.** The fix rode the 2026-07-31 owner Hosting
release; verified live on **both** domains (`frame-src` now lists `https://advancethat.firebaseapp.com`
on `advancethat.web.app` and `46advance.com`, still report-only, smoke check passed on both).

**Next:** observe a fresh window (~1 week, target ~2026-08-07), then flip only if clean. The fix and
the enforce flip must be **separate releases** — verifying no violations *after* the fix is live is
the whole point of the report-only phase.

> **The window only records what someone actually triggers.** The last one surfaced a single
> violation across 7 days, which says these paths see little production traffic — a silent window is
> not evidence of a clean one. During this window deliberately exercise: sign-in, Drive picker +
> sync, Meet/Calendar, packet generate + save to Drive, uploads, and the template push.

**Observe before enforcing** — review collected reports with:

```bash
pwa/scripts/cli/gcloud-safe.sh logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="cspreport" AND jsonPayload.message="CSP violation"' \
  --limit=100 --freshness=7d \
  --format="value(timestamp,jsonPayload.violatedDirective,jsonPayload.blockedUri,jsonPayload.documentUri)"
```

Exercise every Google/Firebase flow (Drive picker + import, Meet/Calendar, packet generate + save
to Drive, uploads, sign-in) during the window. Any violation from a *legitimate* resource means the
allowlist needs that origin added **before** enforcing — otherwise enforcing will break that feature.

When the window is clean: in `pwa/firebase.json` rename the header key
`Content-Security-Policy-Report-Only` → `Content-Security-Policy` (value unchanged), then run the
owner Hosting deploy. Rollback is the reverse rename + redeploy. Note `script-src` still carries
`'unsafe-inline'`, so enforcing blocks unexpected external scripts/objects/base-uri/framing but is
not full XSS protection; tightening to nonce/hash-based inline scripts is a separate effort.

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
