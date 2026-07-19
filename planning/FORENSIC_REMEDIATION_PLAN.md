# 46 Advance — Forensic Remediation Plan

**Date:** 2026-07-18  
**Status:** Proposed — ready for implementation approval; no remediation code has begun.  
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

#### Second opinion:

The findings column keys every workstream to F-numbers, but F-1 through F-12 are defined
nowhere in the repository — only F-13 gets a description, and the source review document is
not committed. Once the review conversation is gone, "WS-C covers F-4" is unresolvable for the
owner and for any implementing session. Add a findings appendix to this document (one row per
finding: number, one-line description, severity, covering workstream), or commit the full
review report under `planning/archive/reference/` and link it from the header.

## Phase 0 — Close security and production-boundary risks

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
6. Restrict Firestore client-create rules once the callable path is live.
7. Add an explicit maximum content size to `getArtistDocumentContent`; reject oversized and
   unsupported files before fully buffering or base64-encoding them.
8. Apply the same trusted-source and size rules to packet generation.
9. Audit existing records with a read-only script before enforcement. Quarantine or report
   unverifiable records; do not delete or rewrite production records without separate approval.

Acceptance criteria:

- A PM cannot register a file outside the event's authorized folder.
- An advance can include only an existing canonical artist document.
- Changing `fileId` or source metadata in a direct client write is denied.
- Oversized content is rejected with a stable typed error and cannot exhaust the callable.
- Rules, unit, and emulator tests cover known-file-ID attacks, cross-event access, missing
  sources, moved files, packet inclusion, and size boundaries.

#### Second opinion:

- Items 7–8 are half-done today: packet generation already enforces a 10 MB cap
  (`MAX_EMBED_BYTES` in `pwa/functions/src/lib/pdf/attachments.ts`, enforced inside
  `fetchBrokeredFileBytes`); only `getArtistDocumentContent` passes no cap (the code comments
  "no cap on this path" in `pwa/functions/src/googleDrive.ts`). Reword item 7 to "align the
  interactive path with the existing `MAX_EMBED_BYTES` cap" and rescope item 8 to verifying
  that alignment, so the implementer reuses the constant instead of inventing a second limit.
- Item 6's "once the callable path is live" understates the gate: in this project "live" means
  deployed to Hosting, not merged — the production frontend routinely trails `main` by weeks.
  Tightening client-create rules before the hosting release that ships the callable-based
  clients breaks the deployed app. Tag this flip as hosting-gated (see the second opinion
  under Cross-cutting implementation rules).
- This workstream is several PRs, not one — see the second opinion under Recommended PR
  sequence for a suggested split.

### WS-B. Revocation and authorization integrity

**Contract change:** Disapproval or access removal must remain effective across claims,
memberships, OAuth-backed background processing, direct rules access, and future sessions.

Implementation:

1. Restrict creator self-membership creation to the atomic event-bootstrap path. A removed
   creator must not be able to recreate a production-manager membership.
2. Make contact `createdBy` and `userId` immutable for ordinary clients. Move legitimate
   relinking or ownership changes to an admin-only callable if the product requires them.
3. Create one idempotent server-side revocation operation that:
   - marks the user unapproved,
   - updates claims without overwriting unrelated concurrent claim changes,
   - revokes Firebase refresh tokens,
   - removes or disables event memberships according to the existing RBAC policy,
   - invalidates/removes stored OAuth credentials and connection state,
   - prevents scheduled jobs from processing the user immediately.
4. Add active-user checks to every scheduled or queue-like Google processing path.
5. Replace account deletion's broad Auth-error suppression with explicit error-code handling.
6. Introduce durable deletion state and idempotent cleanup so retries can finish safely after a
   partial failure. Disable/revoke access before deleting application data.
7. Define and test whether administrator access survives the approved-claim check; keep this
   behavior consistent in Functions, Firestore, Storage, and clients.

Acceptance criteria:

- Removing an event creator's PM membership remains effective.
- A revoked user cannot use a previously issued refresh token after the defined propagation
  window and is ignored by scheduled integrations immediately.
- Contact identity fields cannot be changed through ordinary client updates.
- Concurrent role/approval changes do not lose unrelated custom claims.
- Account deletion never returns success while a live Auth account remains, except for the
  explicitly handled already-deleted case.
- Rules/emulator tests reproduce and then block every original exploit path.

#### Second opinion:

- "After the defined propagation window" is never defined, and it is the hard part of this
  workstream: Firebase ID tokens carry stale claims for up to an hour after refresh-token
  revocation unless privileged paths re-check server-side. Pin the targets here: immediate for
  callables and scheduled jobs (server-side approval/claim re-checks — `assertApproved()` from
  PR #97 is the existing foothold), and an explicit ≤60-minute bound or revocation-aware token
  verification for rules-enforced surfaces. Otherwise the decision silently falls to whoever
  implements PR 3.
- Item 1 depends on machinery built later: the "atomic event-bootstrap path" arrives with
  WS-G.1 in PR 9, while this restriction ships in PR 2. Blank-event creation today is two
  sequential client `setDoc` calls (`pwa/src/features/events/events-service.ts`). Either
  reorder, or have PR 2's rules accept an atomic client batch via `getAfter()` (event and
  membership created together) until the callable replaces it — the plan should state which.
- Items 1–2 tighten rules the currently deployed frontend violates; both flips are
  hosting-gated (see the Cross-cutting second opinion).

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
   advance, contact, document, or schedule data.

Acceptance criteria:

- No prior-user protected data is rendered during or after an account switch.
- Auth transitions cancel or isolate pending requests and optimistic mutations.
- The chosen offline policy is documented in PWA recovery and auth guidance.

#### Second opinion:

Item 5 and the verification matrix's two-user browser test require authenticated Playwright
infrastructure and deterministic emulator identities that this plan only builds in WS-J
(PR 13, Phase 2) — today's suite is three unauthenticated smoke tests that are not wired into
CI. Pull WS-J.3 (deterministic emulator identities) plus one minimal authenticated fixture
forward into Phase 0 as shared infrastructure; WS-B's revocation acceptance tests want the
same identities.

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
2. Separate date-only APIs from instant APIs at the type/helper level.
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

#### Second opinion:

The July 2026 remediation already shipped timezone machinery this workstream should extend
rather than replace: `shiftDayKey` event-timezone day-math (PR #97) and the Functions/PWA
`zonedTime.ts` dedup with golden-vector parity tests (PR #100). Item 2's date-only/instant
split should build on those helpers; a parallel new helper layer would reintroduce exactly the
drift the parity tests exist to prevent. Worth stating in the plan because the implementing
session will not have memory of those PRs.

### WS-G. Atomic creation, slug, and schedule concurrency

Implementation:

1. Move blank event creation and initial membership creation into one callable/batch.
2. Reserve event slugs transactionally in a canonical slug collection. Enforce reservation on
   create, rename, archive/delete, and retry.
3. Audit existing events for duplicate slugs before activating strict enforcement.
4. Make manual booking attach and review-record resolution one atomic backend operation.
5. Add a revision/version precondition to schedule-day writes, or normalize schedule items into
   independently writable documents if the resulting data-model change is justified.
6. Surface a recoverable conflict instead of silently overwriting another editor's changes.
7. Apply idempotency keys to retryable creation callables.

Acceptance criteria:

- Event creation cannot leave an event without its required membership.
- Duplicate slugs cannot be committed, including concurrent requests and non-admin creation.
- Concurrent schedule edits are merged safely or one writer receives an explicit conflict.
- Retrying a timed-out creation request does not produce duplicate events or records.

#### Second opinion:

- Item 4: booking auto-attach was already made transactional in PR #97; the remaining gap is
  manual attach and review-record resolution. Name the existing transaction so the implementer
  extends it instead of building a parallel path.
- Item 5: prefer the revision/version-precondition option explicitly. The alternative of
  normalizing items into independent documents reopens a schedule data model that was
  redesigned and migrated two weeks ago (PRs #108–#114); it should require strong
  justification rather than reading as an equal option.
- Item 1 is the bootstrap path WS-B.1 (PR 2) depends on — see that workstream's second opinion
  for the ordering fix. Moving creation behind a callable and then tightening rules is also
  hosting-gated.

### WS-H. Google integration lifecycle hardening

Implementation:

1. Make Calendar/Meet creation and Drive folder creation idempotent; reconcile an already-created
   remote resource after a timeout before creating another.
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

#### Second opinion:

Item 1 partially exists: adopt-or-cleanup idempotency for Calendar and schedule creates
shipped in PR #100. The uncovered residue is Drive folder creation (and Meet, if it is created
separately). Reword to "extend the existing adopt-or-cleanup pattern to Drive folders" so a
fresh session does not reinvent the mechanism.

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
3. Create deterministic emulator identities for admin, organizer, PM, lead, tech, pending,
   revoked, and cross-event users.
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

#### Second opinion:

Item 3 should not wait for Phase 2: WS-C's two-user test (PR 4) and WS-B's revocation tests
(PRs 2–3) need deterministic emulator identities in Phase 0. Move the identity fixtures (and
one minimal authenticated Playwright fixture) forward and keep the full flow catalog here.

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
6. **Review and gates.** Each code branch runs relevant lint, typecheck, tests, build, rules,
   emulator, and CodeRabbit review before the user review checkpoint.
7. **Observability during migration.** Add structured counters/logs for compatibility or
   reconciliation paths, without logging tokens or sensitive payloads.

#### Second opinion:

Rules 3 and 5 miss the operational fact that makes them dangerous here: Hosting deploys are
owner-performed and infrequent, so the production frontend routinely trails `main` by weeks
while functions/rules deploy per merge. Every workstream that moves a client write behind a
callable and then tightens rules (WS-A.6, WS-B.1–2, WS-G.1) has an enforcement flip that is
only safe after the hosting release containing the new client path — not after merge. The
July remediation hit exactly this with the uid-scoped contact-photo storage rules, which had
to be held for the coupled Hosting deploy. Amendment: give every PR an explicit deploy tag —
"safe to deploy on merge" vs "enforcement gated on next hosting release" — list pending flips
in the Completion record, and schedule hosting releases at phase boundaries so gated flips do
not pile up.

## Recommended PR sequence

The sequence below limits overlapping files and establishes enforcement before broader cleanup:

1. **PR 1 — Drive broker server authorization and payload caps** (`WS-A`)
2. **PR 2 — Membership/contact rules and adversarial tests** (first half of `WS-B`)
3. **PR 3 — Revocation, claims, OAuth disconnect, and account deletion** (second half of `WS-B`)
4. **PR 4 — Auth cache isolation** (`WS-C`)
5. **PR 5 — Emulator, secret-health, and safeguard corrections** (`WS-D`)
6. **PR 6 — Upload lifecycle and compensation** (first half of `WS-E`)
7. **PR 7 — Recursive/soft deletion and orphan inventory** (second half of `WS-E`)
8. **PR 8 — Date-only and event-timezone normalization** (`WS-F`)
9. **PR 9 — Atomic event creation and transactional slugs** (first half of `WS-G`)
10. **PR 10 — Schedule concurrency and remaining coupled writes** (second half of `WS-G`)
11. **PR 11 — Google lifecycle and scheduled-sync hardening** (`WS-H`)
12. **PR 12 — Sentry, App Check observation, headers, and runtime smoke** (`WS-I`)
13. **PR 13 — Authenticated emulator/E2E CI suite** (`WS-J`)
14. **PR 14 — Dependency, workflow, and audit hardening** (`WS-K`)
15. **PR 15 — Performance, accessibility, and dirty-form resilience** (`WS-L`)
16. **PR 16 — Maintenance, release traceability, and shared-contract extraction** (`WS-M`)

PRs may be split further when a migration or review surface becomes too broad. They should not
be merged together merely to reduce PR count.

#### Second opinion:

- Pre-split PR 1: (1a) content-size cap on `getArtistDocumentContent` reusing
  `MAX_EMBED_BYTES` — tiny, independent, immediate win; (1b) callable registration paths plus
  PWA client migration; (1c) rules tightening plus the read-only audit script, explicitly
  gated on the hosting release that ships 1b.
- Add a small "PR 0" (or fold into PR 2): deterministic emulator identities and one minimal
  authenticated Playwright fixture, since the acceptance tests of PRs 2–4 depend on them.
- PR 2 restricts membership creation to a bootstrap path PR 9 builds — resolve with the
  `getAfter()` batch guard or by reordering (see the WS-B second opinion).
- Tag each PR "deploy on merge" vs "hosting-gated" per the Cross-cutting second opinion.

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
- Before/after test counts, coverage, and production bundle sizes.
- Remaining P2/P3 deferrals and their revisit triggers.
- Confirmation that F-13 remains deferred or a separately authorized follow-up reference.

After all approved work is complete, move this file to `planning/archive/fix/` and update
`planning/README.md`.
