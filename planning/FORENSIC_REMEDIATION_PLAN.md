# 46 Advance — Forensic Remediation Plan

**Date:** 2026-07-18; revised 2026-07-20 after inline review

**Status:** Implementation-ready — awaiting explicit approval; no remediation code has begun.
**Source:** Full-repository forensic review of the PWA, shared Firebase backend, rules,
Git history, dependencies, CI/CD, deployment safeguards, observability, and mobile readiness.  
**Overall baseline:** C+ / conditionally production-ready. The engineering foundation is
sound, but the high-priority security, revocation, data-integrity, and operational-safety
findings below should be resolved before broader production use.

## Goal

Raise the current system from conditionally production-ready to a production-hardened
baseline by:

1. Closing authorization and data-exposure paths.
2. Making revocation and deletion complete, durable, and testable.
3. Removing partial-write, destructive-asset, timezone, and concurrency failure modes.
4. Preventing local tooling and deployment checks from reaching or breaking production.
5. Activating actionable observability and meaningful authenticated workflow coverage.
6. Paying down lower-risk performance, accessibility, dependency, and documentation debt.

This is a remediation plan, not a feature plan. Existing behavior should remain stable unless
the behavior is the source of a security, correctness, or operational defect.

## Explicit deferral

### F-13 — Public font licensing verification

**Deferred by the owner on 2026-07-18.** The review found that the public repository tracks
Nexa/Hikou font binaries without repository license metadata and recommended confirming that
the licenses permit public-source redistribution. This question is intentionally excluded
from every implementation phase and release gate in this plan.

The finding remains recorded so it is not lost, but no font removal, history rewrite,
repository-visibility change, EULA work, or legal investigation is authorized by this plan.

## Findings register

This register makes the plan self-contained. The detailed implementation and acceptance
criteria live in the mapped workstreams below.

| Finding | Severity | Disposition | Summary | Principal evidence | Workstream |
| --- | --- | --- | --- | --- | --- |
| F-1 | High | Active | Drive document metadata accepts file IDs without proving the file belongs to the authorized event/library source, allowing the broker service account to become a confused deputy. | `pwa/firestore.rules`; `pwa/functions/src/googleDrive.ts`; packet fetches in `pwa/functions/src/index.ts` | WS-A |
| F-2 | High | Active | Authorization revocation is incomplete: an event creator can recreate removed PM membership, and revoked Google connections continue through scheduled processing. | `pwa/firestore.rules`; `pwa/functions/src/index.ts`; `pwa/functions/src/googleBookings.ts` | WS-B |
| F-3 | High | Active | Contact ownership/link fields are mutable, enabling a linked user to rewrite `createdBy` and then satisfy the delete rule. | `pwa/firestore.rules`; contact rules tests | WS-B |
| F-4 | High | Active | React Query and persistent Firestore caches survive account changes and can expose prior-user data in the same browser. | `pwa/src/main.tsx`; `pwa/src/services/firebase.ts`; auth/query keys | WS-C |
| F-5 | High | Active | Logo/photo replacement can delete the durable old object before the new reference is saved; failed/cancelled drafts also orphan new uploads. | `LogoUploader.tsx`; `PhotoEditor.tsx`; branding/template/contact forms | WS-E |
| F-6 | High | Active | Event dates and some advance-call edits use browser-local `Date` conversion despite the explicit event-timezone invariant. | `pwa/src/lib/dates/parsing.ts`; event/advance forms and services | WS-F |
| F-7 | High | Active | Advance, stage, and quote deletion leaves nested Firestore documents and Storage objects orphaned. | advance, stage, quote, and document services | WS-E |
| F-8 | High | Active | The raw Functions `serve` script selects the production-default project while omitting dependent emulators, so local Admin SDK calls can reach production. | `pwa/functions/package.json`; `pwa/.firebaserc` | WS-D |
| F-9 | High | Active | Account deletion suppresses all Auth deletion errors, performs non-atomic cleanup, and can report success while the Auth account remains. | `pwa/functions/src/index.ts`; `pwa/functions/src/lib/db/chunkedBatch.ts` | WS-B |
| F-10 | High | Active | Interactive document content retrieval has no byte cap and fully buffers/base64-encodes the response. | `pwa/functions/src/googleDrive.ts`; existing packet attachment limit | WS-A |
| F-11 | High | Active | The mandatory predeploy health check omits `DRIVE_SA_KEY`, so deployment can pass while Drive-backed functions cannot start. | `pwa/scripts/cli/verify-secrets-health.sh`; `pwa/functions/src/googleDrive.ts` | WS-D |
| F-12 | Medium-high | Active | Sentry is scaffolded but inactive in production, lacks release/source-map integration, and ordinary `logger.error` calls do not create incidents. | `pwa/src/lib/sentry.ts`; production deployment workflow; Vite config | WS-I |
| F-13 | High (verification) | Deferred | Public-repository redistribution rights for tracked Nexa/Hikou font binaries require confirmation. No action is authorized by this plan. | `pwa/public/fonts/`; `pwa/src/index.css` | Deferred |

## Baseline and definition of done

The 2026-07-18 review established this baseline:

| Check | Baseline |
| --- | --- |
| PWA unit tests | 269 passing across 41 files; 4 React `act()` warnings |
| Functions unit tests | 42 passing across 10 files |
| Firestore and Storage rules tests | 128 passing |
| Emulator-backed callable tests | 26 passing |
| Playwright smoke tests | 3 passing locally; unauthenticated only |
| Total automated checks/tests | 468 passing |
| PWA statement/line coverage | 22.59% |
| Static checks | Lint, TypeScript, dependency architecture, dead exports, and builds pass |
| Dependency advisories | No high/critical; 1 low PWA issue and moderate Functions dependency-chain issues |
| Repository state | `main` clean and synchronized with `origin/main`; no tracked/history secrets found |

The plan is complete only when:

- Every non-deferred P0 and P1 workstream is merged and verified.
- New adversarial tests prove the authorization and revocation defects are closed.
- Destructive and coupled workflows are idempotent or compensating.
- Authenticated critical paths run in CI against emulators.
- Production errors create observable, release-correlated incidents.
- Backend deployment follows the repository's health-check and explicit-confirmation process.
- The completion record lists any remaining P2/P3 deferrals with an owner and revisit trigger.

## Priority model

| Priority | Meaning | Release posture |
| --- | --- | --- |
| P0 | Authorization, privacy, production-boundary, or severe data-loss risk | Resolve first; avoid expanding production use until complete |
| P1 | Material correctness, lifecycle, availability, and observability risk | Resolve immediately after P0 |
| P2 | Test depth, defense in depth, supply chain, performance, and UX resilience | Complete after the production baseline is safe |
| P3 | Maintenance, documentation, and future mobile readiness | May be scheduled independently after P0/P1 |

## Execution map

| Workstream | Priority | Audit findings covered | Primary surface |
| --- | --- | --- | --- |
| WS-A. Drive broker authorization and limits | P0 | F-1, F-10; Drive registration and bearer-content risks | Functions, callable contracts, rules, PWA document services |
| WS-B. Revocation and authorization integrity | P0 | F-2, F-3, F-9; claim races and delayed revocation | Functions, Firestore rules, auth/RBAC clients |
| WS-C. Cross-user cache isolation | P0 | F-4 | Auth provider, React Query, Firestore persistence |
| WS-D. Production-safe local and deploy tooling | P0 | F-8, F-11; safeguard portability | Emulator scripts, wrappers, predeploy checks, hooks |
| WS-E. Asset and recursive-deletion integrity | P1 | F-5, F-7; upload compensation and orphan cleanup | PWA uploads, Functions cleanup callables, Storage |
| WS-F. Timezone correctness | P1 | F-6 | Date helpers, events, advances, schedules |
| WS-G. Atomic creation, slug, and schedule concurrency | P1 | Coupled writes, slug ambiguity, last-writer-wins schedules | Functions, contracts, Firestore, event/schedule clients |
| WS-H. Google integration lifecycle hardening | P1 | OAuth/idempotency, calendar ownership, pagination, logging | Google Functions and tests |
| WS-I. Production observability and runtime defense | P1 | F-12; App Check, headers, post-deploy validation | Sentry, workflows, callable configuration, hosting config |
| WS-J. Authenticated workflow assurance | P2 | Low coverage, missing authenticated E2E, `act()` warnings | Vitest, emulator fixtures, Playwright, CI |
| WS-K. Dependency and supply-chain posture | P2 | Audit visibility, exceptions, mutable workflow versions | Lockfiles, Dependabot, Actions, audit workflow |
| WS-L. PWA performance, accessibility, and state UX | P2 | Route splitting, responsive/a11y gaps, draft refetch | PWA routing, layouts, modals, admin forms |
| WS-M. Maintenance and mobile foundation | P3 | Documentation drift, formatting, release traceability, mobile contracts | Planning/docs, tooling, contracts, future mobile CI |

## Phase 0 — Close security and production-boundary risks

### Phase 0 shared prerequisite — authenticated test foundation

Do not defer all authenticated browser infrastructure to WS-J. Before the WS-B and WS-C
acceptance work begins:

1. Create deterministic emulator identities for admin, organizer, PM, lead, tech, pending,
   revoked, and cross-event users.
2. Add one minimal authenticated Playwright fixture capable of switching between two emulator
   users without sharing browser state.
3. Keep this foundation small: it supports P0 regression tests, while WS-J still owns the full
   authenticated workflow catalog and CI expansion.

### Phase 0 dependency — atomic blank-event bootstrap

WS-B must not tighten event-creator membership rules until the replacement creation path
exists. Pull the blank-event portion of WS-G forward:

1. Add an idempotent callable that creates the blank event and initial creator membership
   atomically.
2. Migrate the PWA client to the callable and verify retries cannot create duplicates.
3. Release that client through the owner-operated Hosting workflow.
4. Only after the Hosting release is verified may WS-B disable the legacy membership bootstrap
   write. Do not add a temporary `getAfter()` rules path unless the callable migration proves
   impractical.

### WS-A. Drive broker authorization and limits

**Contract change:** Clients must no longer be able to make a broker-visible file available to
an event or advance merely by writing its `fileId`. Every registered document must have a
server-verified canonical source and authorized parent folder.

Implementation:

1. Inventory every writer and reader of:
   - `artistDocuments/{documentId}`
   - `events/{eventId}/documents/{documentId}`
   - `events/{eventId}/stages/{stageId}/advances/{advanceId}/documents/{documentId}`
   - `getArtistDocumentContent` and packet attachment fetches
2. Replace client-side event and artist document registration with callable operations.
3. For event documents, resolve the event's recorded Drive folder server-side and verify the
   selected file is in that authorized folder before writing metadata.
4. For advance inclusion, resolve the canonical `artistDocuments` record server-side. Copy the
   trusted metadata from that source; never accept replacement Drive metadata from the client.
5. Make canonical document IDs deterministic where appropriate and reject mismatched
   `documentId` / `fileId` combinations.
6. Restrict Firestore client-create rules only after the callable-based PWA has been released
   and verified through the owner-operated Hosting workflow. This is a Hosting-gated
   enforcement flip, not a merge-time or Functions-deploy-time flip.
7. Align `getArtistDocumentContent` with a centralized broker content-limit policy. Packet
   generation already enforces `MAX_EMBED_BYTES` (10 MB); choose the interactive limit with the
   base64/callable response envelope included, then place shared limits in a neutral broker
   module rather than inventing unrelated constants.
8. Verify packet generation continues enforcing its existing 10 MB attachment cap while using
   the same bounded-fetch primitive; do not weaken the packet limit during consolidation.
9. Audit existing records with a read-only script before enforcement. Quarantine or report
   unverifiable records; do not delete or rewrite production records without separate approval.

Acceptance criteria:

- A PM cannot register a file outside the event's authorized folder.
- An advance can include only an existing canonical artist document.
- Changing `fileId` or source metadata in a direct client write is denied.
- Oversized content is rejected with a stable typed error and cannot exhaust the callable.
- Rules, unit, and emulator tests cover known-file-ID attacks, cross-event access, missing
  sources, moved files, packet inclusion, and size boundaries.

### WS-B. Revocation and authorization integrity

**Contract change:** Disapproval or access removal must remain effective across claims,
memberships, OAuth-backed background processing, direct rules access, and future sessions.

Implementation:

1. After the Phase 0 blank-event callable is live in Hosting, restrict creator self-membership
   creation to that server-side bootstrap path. A removed creator must not be able to recreate
   a production-manager membership.
2. Make contact `createdBy` and `userId` immutable for ordinary clients. Move legitimate
   relinking or ownership changes to an admin-only callable if the product requires them. The
   current contact client updates neither field, so this rule can deploy independently of a
   Hosting release after adversarial tests pass.
3. Create one idempotent server-side revocation operation that:
   - marks the user unapproved,
   - updates claims without overwriting unrelated concurrent claim changes,
   - revokes Firebase refresh tokens,
   - removes or disables event memberships according to the existing RBAC policy,
   - invalidates/removes stored OAuth credentials and connection state,
   - prevents scheduled jobs from processing the user immediately.
4. Make revocation immediate for callables and scheduled/background jobs by consulting the
   authoritative user approval/revocation record. Keep the existing token-based
   `assertApproved()` fast gate, but do not treat a decoded ID token as authoritative after an
   administrator revokes the user.
5. Add the same authoritative active-user check to every scheduled or queue-like Google
   processing path.
6. Replace account deletion's broad Auth-error suppression with explicit error-code handling.
7. Introduce durable deletion state and idempotent cleanup so retries can finish safely after a
   partial failure. Disable/revoke access before deleting application data.
8. Define and test whether administrator access survives the approved-claim check; keep this
   behavior consistent in Functions, Firestore, Storage, and clients.
9. Document the direct Firestore/Storage propagation bound: with claim-based rules, already
   issued ID tokens may remain usable for at most their normal lifetime (target: no more than
   60 minutes). If the product requires immediate direct-SDK revocation, replace claim-only
   approval checks with an authoritative rules-readable status before declaring this complete.

Acceptance criteria:

- Removing an event creator's PM membership remains effective.
- A revoked user is blocked immediately by callables and scheduled integrations, cannot mint a
  new valid session after refresh-token revocation, and loses claim-based direct-SDK access
  within the documented maximum 60-minute token lifetime.
- Contact identity fields cannot be changed through ordinary client updates.
- Concurrent role/approval changes do not lose unrelated custom claims.
- Account deletion never returns success while a live Auth account remains, except for the
  explicitly handled already-deleted case.
- Rules/emulator tests reproduce and then block every original exploit path.

### WS-C. Cross-user cache isolation

Implementation:

1. Include the authenticated UID in every sensitive React Query key, or place all sensitive
   keys beneath one UID-scoped root.
2. On every auth identity transition—not only explicit sign-out—cancel in-flight requests and
   remove the prior user's query data before rendering the next user's application state.
3. Decide and document the Firestore persistence policy:
   - recommended default: keep offline persistence for single-user continuity but clear it on
     explicit sign-out when Firebase permits safe termination/reinitialization;
   - if clearing cannot be made reliable, disable persistent Firestore caching on shared web
     clients and document the offline tradeoff.
4. Ensure optimistic mutations cannot settle into the next user's cache after sign-out.
5. Add a two-user browser/emulator test that proves user B never renders user A's event,
   advance, contact, document, or schedule data, using the Phase 0 authenticated fixture.

Acceptance criteria:

- No prior-user protected data is rendered during or after an account switch.
- Auth transitions cancel or isolate pending requests and optimistic mutations.
- The chosen offline policy is documented in PWA recovery and auth guidance.

### WS-D. Production-safe local and deploy tooling

Implementation:

1. Remove or replace the raw Functions `serve` command. Force the safe wrapper, the
   `demo-46advance` project, and all dependent emulators.
2. Add `DRIVE_SA_KEY` to the mandatory Functions secret-health check.
3. Remove the `SKIP_SECRETS_HEALTH` bypass or narrowly limit it to a documented test-only mode
   that cannot be used by the deployment command.
4. Make wrapper enforcement reproducible in a clean clone rather than dependent on ignored
   local settings.
5. Make safeguard verification fail when mandatory root wiring is absent.
6. Test both raw CLI and wrapper-form hosting deploy commands; hosting deployment must remain
   blocked under all supported command shapes.
7. Add non-destructive project assertions and dry-run defaults to legacy cleanup/migration
   scripts. Require explicit target confirmation for any destructive mode.

Acceptance criteria:

- No supported local Functions command can fall back to production Firestore or Auth.
- A missing/disabled OAuth or Drive secret fails Functions predeploy.
- A clean clone receives and verifies the mandatory safeguards.
- Destructive scripts identify the exact project and default to reporting rather than deleting.

## Phase 1 — Make data lifecycle and integrations durable

### WS-E. Asset and recursive-deletion integrity

Implementation:

1. Change logo/photo uploader contracts so persistence is Promise-based and parent-owned.
2. Persist the new Storage reference before deleting the old object.
3. Delete a newly uploaded object when its metadata save fails or a draft is explicitly
   abandoned; preserve it while a recoverable save remains pending.
4. Add compensation to production attachment and signed-quote upload workflows.
5. Replace client-only advance/stage deletion with privileged recursive cleanup covering all
   known subcollections and related Storage paths.
6. Prefer a soft-delete/audit state for high-value records; perform physical deletion through
   an idempotent cleanup job where practical.
7. Build a read-only orphan inventory before any cleanup. Cleanup execution is a separate
   destructive action requiring explicit approval.

Acceptance criteria:

- Cancelled or failed edits never break the previously persisted asset.
- Failed metadata writes do not leave new uploads indefinitely orphaned.
- Stage/advance/quote deletion handles every nested document and owned object exactly once.
- Emulator tests prove retry safety and partial-failure recovery.

### WS-F. Timezone correctness

**Data rule:** Date-only concepts use stable `YYYY-MM-DD` calendar keys. Instants are stored as
timestamps and are parsed/formatted with an explicit event timezone.

Implementation:

1. Inventory every date input, parser, formatter, timestamp writer, schedule-template anchor,
   and PDF formatter across PWA and Functions.
2. Separate date-only APIs from instant APIs by extending the machinery already shipped in
   PRs #97 and #100: `shiftDayKey`, the PWA/Functions zoned-time helpers, and their golden-vector
   parity tests. Do not create a parallel date-helper layer.
3. Replace browser-local event-date and manual advance-call conversion with explicit zoned
   helpers.
4. Ensure event timezone is available at every editing and rendering boundary that handles an
   instant.
5. Define compatibility parsing for existing records; avoid a destructive rewrite unless an
   audit proves stored values are already shifted.
6. Test at least Chicago, UTC, Pacific, Eastern, and a zone with a materially different date,
   including DST boundaries.

Acceptance criteria:

- The same event date renders identically in every browser timezone.
- Advance calls round-trip to the same instant and expected local event time.
- Schedule templates and PDFs use the event's intended calendar day.

### WS-G. Atomic creation, slug, and schedule concurrency

Implementation:

1. Complete and retain the Phase 0 callable migration for blank event + initial membership
   creation; keep its idempotency and authorization tests with this workstream.
2. Reserve event slugs transactionally in a canonical slug collection. Enforce reservation on
   create, rename, archive/delete, and retry.
3. Audit existing events for duplicate slugs before activating strict enforcement.
4. Extend the transactional booking auto-attach pattern shipped in PR #97 so manual attach and
   review-record resolution become one atomic backend operation rather than a parallel design.
5. Add a revision/version precondition to whole-day schedule writes and return an explicit
   conflict on stale revisions. The PR #108–#114 day-container model remains canonical;
   normalizing items into separate documents requires a separately justified redesign.
6. Surface a recoverable conflict instead of silently overwriting another editor's changes.
7. Apply idempotency keys to retryable creation callables.

Acceptance criteria:

- Event creation cannot leave an event without its required membership.
- Duplicate slugs cannot be committed, including concurrent requests and non-admin creation.
- Concurrent schedule edits are merged safely or one writer receives an explicit conflict.
- Retrying a timed-out creation request does not produce duplicate events or records.

### WS-H. Google integration lifecycle hardening

Implementation:

1. Extend the adopt-or-cleanup pattern shipped in PR #100. Event-calendar creation and schedule
   reconciliation already use it; add retry reconciliation to Drive folder creation and to
   `createAdvanceCall`'s Calendar-event/Meet insertion, which remain uncovered.
2. Resolve event-calendar ownership explicitly. Do not assume another PM can operate on the
   first creator's private calendar without verified sharing/permissions.
3. Paginate every Calendar and Drive list operation; remove fixed-result assumptions.
4. Bound scheduled sync work per invocation and checkpoint progress so large user/event sets do
   not exceed the function timeout.
5. Redact Google/Gaxios errors before logging; do not persist or log tokens, request headers, or
   unnecessary personal data.
6. Define retention for booking/booker data and OAuth state.
7. Make OAuth state consumption transactional and ensure disconnect cannot race with a token
   refresh that recreates the credential.
8. Validate callable outputs at the server boundary in addition to parsing inputs.

Acceptance criteria:

- Retried Google operations return/reconcile the same resource.
- Multi-PM calendar behavior has an explicit, tested ownership and sharing model.
- Scheduled sync paginates, checkpoints, and skips inactive users.
- Logs contain stable error context without credentials or unnecessary Google response data.

### WS-I. Production observability and runtime defense

Implementation:

1. Provision and pass `VITE_SENTRY_DSN` and a commit-derived `VITE_APP_RELEASE` to production.
2. Add the Sentry Vite plugin and authenticated source-map upload when the Sentry organization
   and token are provisioned. Do not publish source maps as public Hosting assets.
3. Route `logger.error` to exception capture while preserving useful breadcrumbs for lower
   levels; prevent duplicate captures from React error boundaries.
4. Add feature/user-safe context and release correlation without sending sensitive data.
5. Add App Check enforcement progressively: observe first, validate supported clients, then
   enforce on callable/Firestore/Storage surfaces where supported.
6. Add CSP, `frame-ancestors`, MIME-sniffing, referrer, and permissions-policy headers after
   testing Firebase Auth, Google Picker, Sentry, and PWA behavior.
7. Add a post-deployment health/smoke check against the deployed URL. Hosting remains externally
   managed and must not be deployed by agents.

Acceptance criteria:

- A deliberate production-safe test exception produces a release-correlated Sentry event with
  readable source frames.
- Routine mutation/background failures are captured, not only breadcrumbed.
- App Check rollout has monitoring and an emergency rollback path.
- Security headers pass browser flows and an automated header assertion.
- Production deployment reports runtime smoke success or failure.

## Phase 2 — Increase assurance and reduce operational debt

### WS-J. Authenticated workflow assurance

Implementation:

1. Eliminate the four `LineupPanel` unwrapped-`act()` warnings.
2. Add adversarial unit/rules/emulator tests alongside each P0/P1 fix.
3. Expand the deterministic identities and minimal authenticated fixture created in Phase 0;
   do not build a second harness.
4. Add authenticated Playwright flows for:
   - approval and revocation,
   - event creation and slug routing,
   - member access boundaries,
   - document registration/opening,
   - user switching and cache isolation,
   - timezone-sensitive event/advance editing,
   - asset save/cancel/failure,
   - schedule conflict handling.
5. Run a small, stable Chromium emulator smoke suite in CI. Keep slower cross-browser,
   accessibility, and offline suites separately triggerable until stable enough to gate.
6. Ratchet coverage around changed orchestration code rather than chasing a global percentage
   through low-value tests.
7. Include Functions tests and emulator harnesses in a real TypeScript typecheck.

Acceptance criteria:

- All P0/P1 defects have regression tests at their actual enforcement boundary.
- CI exercises at least one authenticated critical-path workflow.
- Test output has no React timing warnings.
- Coverage floors cannot regress and the newly remediated service/orchestration modules have
  meaningful direct coverage.

### WS-K. Dependency and supply-chain posture

Implementation:

1. Document the `ts-deepmerge` dev-only advisory in `functions/SECURITY_EXCEPTIONS.md` with a
   review date and removal trigger.
2. Reconcile the stated major-upgrade policy with Dependabot's blanket major ignores. Schedule
   deliberate Firebase, firebase-admin, googleapis, and related major evaluations.
3. Make scheduled audit findings visible in the GitHub job summary and distinguish accepted
   exceptions from new advisories.
4. Keep the audit non-gating only while every new moderate-or-higher advisory creates a visible
   escalation; define when an advisory becomes release-blocking.
5. Pin third-party GitHub Actions to full commit SHAs and Firebase CLI to an exact version.
6. Declare least-privilege workflow permissions, especially for the deployment action that
   receives the Firebase service account.
7. Apply the available low-risk PWA `esbuild` update after normal verification.

Acceptance criteria:

- Every current advisory is upgraded, removed, or explicitly time-bounded.
- Workflow dependencies are immutable and permissions are minimal.
- A new advisory is clearly visible even when the workflow remains green.

### WS-L. PWA performance, accessibility, and state UX

Implementation:

1. Replace lazy imports of the Events barrel with direct screen-module imports so each route can
   split independently.
2. Revisit forced common-vendor chunking and measure initial-route transfer/parse cost before and
   after changes.
3. Exclude development-only `ThemeSpecimen` code from production bundles.
4. Make application and event action headers wrap or collapse cleanly at supported mobile widths.
5. Bring interactive targets to the documented 44px target where practical.
6. Give the photo cropper full dialog semantics, Escape handling, focus trap, and focus restore.
7. Add a responsive alternative or scroll containment for the admin table.
8. Prevent query refetch-on-focus from overwriting dirty branding or crew-type drafts.
9. Add automated accessibility checks for key authenticated screens and manual keyboard/mobile
   QA to the PR checklist.

Acceptance criteria:

- Event routes produce genuine per-screen chunks and initial route cost does not regress.
- Supported narrow widths do not lose navigation or actions to horizontal overflow.
- Modal focus behavior and primary screen landmarks pass automated and keyboard checks.
- Unsaved admin drafts survive routine focus/refetch events or explicitly warn before reset.

## Phase 3 — Maintenance and future mobile readiness

### WS-M. Maintenance and mobile foundation

Implementation:

1. Add a `.prettierignore` for generated/ignored output, format intended source/docs in a
   dedicated change, and decide whether `format:check` should become CI-gated.
2. Reconcile active/archive planning indexes, stale phase/TBD statements, implemented PWA
   recovery behavior, and obsolete inline comments.
3. Establish release traceability: commit-derived app release, changelog discipline, and a
   lightweight deployment/rollback ledger. Tags/releases may be added when the owner chooses a
   release policy.
4. Break up concentrated files such as the Functions index and schedule screen where extraction
   produces real domain boundaries; do not refactor solely to reduce line counts.
5. Before native feature work begins, extract callable and document contracts into a consumable,
   SDK-agnostic package and run it through both server and PWA typechecks.
6. Correct the mobile documentation's contract paths and add mobile CI/Dependabot only when an
   actual Expo package exists.
7. Treat the native application itself as a separate approved feature plan. This remediation
   plan does not authorize inventing or building mobile product scope.

Acceptance criteria:

- Formatting checks inspect only intentional source/documentation files and pass cleanly.
- Planning indexes and implementation-status claims agree with the repository.
- Each production build exposes a source commit/release identifier.
- Shared contracts are consumable without importing Firebase Web or native SDK types.

## Cross-cutting implementation rules

1. **Branch per logical workstream.** Use `fix/`, `refactor/`, or `chore/` branches as
   appropriate; never implement code directly on `main`.
2. **Shared-surface audit.** Every Functions, rule, document-shape, claim, Storage-path, or
   callable change must grep all clients. Mobile has no implementation today, but its documented
   assumptions and shared-contract path must still be checked.
3. **Backward compatibility.** Broaden schemas before writers depend on new optional fields.
   Coordinate any rename, narrowing, or required-field change across server, PWA, rules, tests,
   migrations, and future shared contracts.
4. **No destructive production cleanup by default.** Audits and dry runs may ship with the
   remediation. Deletion, history rewriting, and data migrations require explicit target review
   and approval.
5. **Backend deployment is separate.** After merge, Functions/rules changes require the secret
   health check and explicit deployment confirmation. Never deploy Firebase Hosting.
6. **Classify every deployment.** Every implementation PR must carry one of the deployment tags
   defined below. A merge is not evidence that its client path is live.
7. **Gate restrictive rules on the live client.** When a change adds a callable client path and
   later removes the legacy direct-write path, use this order:
   1. deploy the additive/backward-compatible Function after explicit confirmation;
   2. release and verify the new PWA through the owner-operated Hosting workflow;
   3. only then deploy the restrictive Firestore/Storage rules after explicit confirmation.
   Record pending enforcement flips so they cannot be deployed early or forgotten.
8. **Review and gates.** Each code branch runs relevant lint, typecheck, tests, build, rules,
   emulator, and CodeRabbit review before the user review checkpoint.
9. **Observability during migration.** Add structured counters/logs for compatibility or
   reconciliation paths, without logging tokens or sensitive payloads.

Deployment tags:

| Tag | Meaning |
| --- | --- |
| `NONE` | No production deployment; tests, docs, tooling, or audit only |
| `FUNCTIONS` | Backward-compatible Functions deployment allowed only after health check and explicit confirmation |
| `RULES` | Backward-compatible rules deployment allowed only after tests and explicit confirmation |
| `HOSTING` | Requires the owner-operated manual Hosting workflow; agents never deploy Hosting |
| `HOSTING-GATED RULES` | Restrictive rules must wait for a named, verified Hosting checkpoint |
| `MIXED` | Components have different tags and must be deployed in the documented order or split before deployment |

## Recommended delivery sequence

Change-set IDs describe order; they are not predicted GitHub PR numbers. Keep each row as one
reviewable PR unless implementation discovery justifies a smaller split. Do not combine rows
merely to reduce PR count.

| Order | Scope | Workstream | Deploy tag and ordering |
| --- | --- | --- | --- |
| S0 | Deterministic emulator identities and one minimal authenticated Playwright fixture | Phase 0 / WS-J foundation | `NONE` |
| S1 | Interactive broker content cap using a centralized bounded-fetch policy; preserve packet's existing 10 MB cap | WS-A / F-10 | `FUNCTIONS` |
| S2 | Server-validated Drive registration callables plus PWA client migration; no restrictive rules yet | WS-A / F-1 | `MIXED`: additive `FUNCTIONS`, then hold client for H0 |
| S3 | Idempotent atomic blank-event + creator-membership callable plus PWA client migration | Phase 0 / WS-G foundation | `MIXED`: additive `FUNCTIONS`, then hold client for H0 |
| S4 | UID-scoped queries, auth-transition cancellation, and selected Firestore persistence policy | WS-C / F-4 | `HOSTING`; include in H0 |
| S5 | Authoritative revocation, claim update safety, OAuth disconnect, refresh-token revocation, and durable account deletion | WS-B / F-2, F-9 | `FUNCTIONS` |
| S6 | Immutable contact ownership/link fields plus adversarial rules tests | WS-B / F-3 | `RULES`; compatible with current client |
| S7 | Safe emulator command, complete secret-health gate, reproducible safeguards, and dry-run script guards | WS-D / F-8, F-11 | `NONE`; affects future operator commands/deploys |
| H0 | **Owner Hosting checkpoint:** release and verify the clients from S2–S4; record deployed commit SHA | Phase 0 | `HOSTING`; owner-operated, not an agent PR/deploy |
| S8 | Drive registration and event-membership enforcement flips plus read-only legacy-record reports | WS-A, WS-B | `HOSTING-GATED RULES`; deploy only after H0 verification |
| S9 | Promise-based logo/photo persistence and upload compensation | WS-E / F-5 | `HOSTING` |
| S10 | Privileged recursive/soft deletion and read-only orphan inventory | WS-E / F-7 | `MIXED`; additive `FUNCTIONS`, client via next Hosting release; cleanup execution separately approved |
| S11 | Date-only/instant correction using existing zoned-time helpers and parity tests | WS-F / F-6 | `MIXED`; deploy compatible Functions first, client through Hosting |
| S12 | Transactional slugs, manual booking attach, and schedule revision conflicts | WS-G | `MIXED`; document any rule enforcement that waits for its Hosting client |
| S13 | Google retry/idempotency, calendar ownership, pagination, checkpointing, OAuth races, retention, and redacted errors | WS-H | `FUNCTIONS` |
| S14 | Sentry/release/source maps, App Check observation, security headers, and runtime smoke | WS-I / F-12 | `MIXED`; requires owner-provisioned secrets and Hosting workflow changes |
| S15 | Full authenticated workflow catalog, CI smoke, warning cleanup, and Functions-test typechecking | WS-J | `NONE` |
| S16 | Advisory policy, immutable Action/CLI versions, least-privilege workflow permissions | WS-K | `NONE` |
| S17 | Route chunks, responsive/a11y fixes, modal semantics, and dirty-form resilience | WS-L | `HOSTING` |
| S18 | Formatting/docs/release traceability and shared-contract extraction | WS-M | `NONE` unless release metadata changes the PWA build |

S2 and S3 may proceed independently after S0, but both client migrations and S4 should share
H0 so the owner performs one deliberate Phase 0 Hosting release. S8 is blocked until H0's
deployed SHA and smoke result are recorded.

## Implementation kickoff

After explicit implementation approval, begin with S0 and then S1. They are intentionally
small and do not depend on a Hosting release.

### S0 kickoff — authenticated emulator foundation

- Suggested branch: `test/authenticated-emulator-fixtures`
- Primary surfaces: `pwa/playwright.config.ts`, `pwa/tests/`, emulator startup scripts, and
  test-only seed/auth helpers.
- Keep all identities and data in the `demo-46advance` emulator project; add a hard assertion
  that prevents the fixture from running against `advancethat`.
- Initial proof: admin and two ordinary users can authenticate in isolated browser contexts,
  retain independent auth state, and receive the expected seeded event memberships. The actual
  cross-user query-cache regression assertion lands with S4.
- Required gates: targeted fixture tests, existing Playwright smoke, PWA typecheck/lint, and a
  clean shutdown that leaves no production configuration or tracked credentials.

### S1 kickoff — bounded interactive broker content

- Suggested branch: `fix/document-broker-size-cap`
- Primary surfaces: `pwa/functions/src/googleDrive.ts`, the existing PDF attachment/broker
  helper, callable tests, and the relevant callable output/error contract.
- First decide the raw-byte limit from the callable response envelope, including base64
  expansion. Centralize bounded fetching in a neutral helper and preserve the packet path's
  existing 10 MB behavior.
- Initial proof: exact-boundary content succeeds; over-limit content fails before full buffering
  or response encoding; packet attachment tests remain unchanged in behavior.
- Required gates: Functions lint/typecheck/test/build and the emulator-backed callable suite.

Do not begin S2's Drive authorization migration until S0 is available for its adversarial
browser/emulator coverage. S0 and S1 may be separate review branches, but only one should be
actively edited in the shared worktree at a time unless isolated worktrees are used.

## Verification matrix

| Surface | Required verification |
| --- | --- |
| Firestore/Storage rules | Positive and adversarial emulator rules tests for every changed path |
| Functions/callables | Unit tests, Functions typecheck/build, emulator-backed authorization and retry tests |
| Shared contracts | Server and PWA compile against the same schema; input and output runtime validation |
| Auth/cache | Two-user browser test, revoked-token test, in-flight mutation isolation test |
| Google integrations | Mocked API error/retry/pagination tests plus controlled non-production integration verification |
| Timezone | Multi-zone and DST unit tests plus browser flow in a non-Central timezone |
| Storage/lifecycle | Save, cancel, failure, retry, replacement, recursive deletion, and orphan-audit tests |
| PWA | Lint, typecheck, architecture, dead exports, coverage, build, authenticated Playwright smoke |
| Operations | Wrapper/safeguard tests, secret-health failure tests, workflow syntax/review, runtime smoke |

## Completion record

When P0 and P1 are complete, update this document with:

- PR numbers and merge dates for each workstream.
- Any data audit or migration counts, without sensitive record contents.
- Deployment targets and health-check results.
- The Hosting commit SHA and smoke result for each checkpoint.
- Every pending enforcement flip, its required Hosting checkpoint, and its eventual rules
  deployment result.
- Before/after test counts, coverage, and production bundle sizes.
- Remaining P2/P3 deferrals and their revisit triggers.
- Confirmation that F-13 remains deferred or a separately authorized follow-up reference.

After all approved work is complete, move this file to `planning/archive/fix/` and update
`planning/README.md`.
