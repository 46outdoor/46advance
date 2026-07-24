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

**Hosting live state (verified 2026-07-24).** Owner workflow run `30055170800` deployed `main` at
`d6c60c5`. It carries the quick-wins client changes — Drive import/picker errors (#178), the
Packet-filename admin control (#179), the upload-orphan guard (#181) — and the CSP `report-uri`
header (#180). Verified live: both `advancethat.web.app` and `46advance.com` serve
`content-security-policy-report-only` ending in `report-uri …/cspReport`, plus HSTS + nosniff.
(Prior checkpoint: run `30042323489` at `f0e45ea` (#174), the remediation client release.)

Both `VITE_SENTRY_DSN` and `SENTRY_AUTH_TOKEN` are provisioned. Owner-provided Sentry evidence
confirmed the safe Admin → Observability diagnostic reached production Issues with a release tag and
a readable source-mapped frame (`ObservabilityDiagnostics.tsx:17:18`).

### CSP: report-only → enforce (open thread)

Reporting went live with the 2026-07-24 Hosting release; violations now POST to the `cspReport`
function and land in Cloud Logging. **Observe before enforcing** — review collected reports with:

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
