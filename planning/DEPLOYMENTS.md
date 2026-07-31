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
