# 46 Advance Foundation Review and Remediation Plan

**Date:** 2026-06-25  
**Scope:** Current repo foundation, guardrails, organization, Firebase backend, PWA implementation, and mobile-readiness contracts.  
**Status:** Active remediation plan. Move to `planning/archive/fix/` once the fixes below are implemented or consciously deferred.

## Review Summary

The project has a strong foundation for a young codebase: strict TypeScript, ESLint, dependency-cruiser, Firebase rules tests, clear planning docs, and a coherent PWA feature layout. The main risk is that several governance promises are ahead of the implementation. The highest-priority fixes should make backend guardrails enforce the same rules that the UI and docs already claim: approved-user access, document shape validity, callable contracts, deploy secret safety, and wrapper-safe operational commands.

## Verification Snapshot

Commands run on 2026-06-25:

| Check | Result | Notes |
| --- | --- | --- |
| `bash .claude/verify-safeguards.sh` | Pass with warnings | Root hook/settings warnings remain. |
| `npm run lint` in `pwa/` | Pass | ESLint is strict and useful. |
| `npm run typecheck` in `pwa/` | Pass | PWA TypeScript clean. |
| `npm run test` in `pwa/` | Pass | 102 unit tests passed. |
| `npm run test:coverage` in `pwa/` | Pass, no threshold | Coverage is 24.65% lines/statements. |
| `npm run build` in `pwa/` | Pass with chunk warning | Main minified JS chunk is about 955 KB. |
| `npm run arch:check` in `pwa/` | Pass | No dependency-cruiser violations. |
| `npm run typecheck` in `pwa/functions/` | Pass | Functions TypeScript clean. |
| `npm run build` in `pwa/functions/` | Pass | Functions compile cleanly. |
| Firestore rules tests via emulator | Pass | 72 rules tests passed, but emulator project warnings appeared. |
| `npm audit --audit-level=moderate` in `pwa/` | Pass threshold | One low `esbuild` advisory. |
| `npm audit --audit-level=moderate` in `pwa/functions/` | Fails | Moderate `uuid` advisory through Google/Firebase dependency chain. |

## Priority Fixes

### P0. Enforce Approved-User Access in Backend Rules

**Problem:** The app has an approval gate in UI and custom claims, but Firestore and Storage rules generally treat any signed-in user as eligible. Pending or revoked users can still access direct Firestore/Storage surfaces where rules use `isSignedIn()` or event membership.

**Evidence:**
- UI gate: `pwa/src/features/auth/AuthGate.tsx`
- Claim creation: `pwa/functions/src/index.ts`
- Firestore rules: `pwa/firestore.rules`
- Storage rules: `pwa/storage.rules`

**Proposed patch:**

1. Add approved helpers to Firestore rules:

```rules
function isApproved() {
  return isSignedIn() && request.auth.token.get('approved', false) == true;
}

function isActiveUser() {
  return isAdmin() || isApproved();
}
```

2. Replace broad signed-in gates with active-user gates:

```rules
allow read: if isActiveUser();
allow create: if isActiveUser() && request.resource.data.createdBy == request.auth.uid;
```

3. Update membership and event access:

```rules
function isMember(eventId) {
  return isActiveUser() && exists(memberPath(eventId));
}

function canCreateEvents() {
  return isActiveUser() && (isAdmin() || isOrganizer());
}
```

4. Mirror the same concept in Storage:

```rules
function isApproved() {
  return isSignedIn() && request.auth.token.approved == true;
}

function isActiveUser() {
  return isAdmin() || isApproved();
}

function isMember(eventId) {
  return isActiveUser()
    && firestore.exists(/databases/(default)/documents/events/$(eventId)/members/$(request.auth.uid));
}
```

5. Add rules tests for:
- Pending signed-in user cannot read departments/templates/contacts.
- Pending event member cannot read event documents or Storage paths.
- Revoked approved claim loses access.
- Admin remains allowed.

**Implementation notes:** `syncUserClaims` must remain callable for all authenticated users so new users can receive their pending claim/profile. Other callables that mutate shared data should check `approved` or `admin` server-side.

### P0. Confirm and Externalize Admin Bootstrap

**Problem:** Project ownership docs name `jared@yourstagemanager.com`, but the Functions admin allowlist is hardcoded to `jared@46entertainment.com`. If the intended owner signs in with the former address, the repo can lock itself out of admin-only flows.

**Evidence:**
- Workspace project owner: `AGENTS.md`
- Admin allowlist: `pwa/functions/src/index.ts`

**Proposed patch:**

1. Move admin bootstrap emails to config:

```ts
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'jared@yourstagemanager.com')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
```

2. Document the canonical bootstrap identity in `AGENTS.md` and the operator runbook.

3. Add a small functions unit test around the email parsing helper once extracted.

**Open decision:** Confirm whether the canonical bootstrap admin is `jared@yourstagemanager.com`, `jared@46entertainment.com`, or both.

### P0. Add Firestore Shape and State-Machine Validation

**Problem:** Current Firestore rules mostly enforce RBAC, not document shape. Client-side Zod parsers expect strict shapes, so a malformed PM/admin direct write can break screens for every event member.

**Evidence:**
- Event parser: `pwa/src/lib/events/event.ts`
- Advance parser: `pwa/src/lib/advances/advance.ts`
- Section state machine: `pwa/src/lib/advances/sections.ts`
- Quote state machine: `pwa/src/lib/quotes/quote.ts`
- Broad update gates: `pwa/firestore.rules`

**Proposed patch:**

Add rule helper functions for each important document type:

```rules
function validEventStatus(status) {
  return status in ['draft', 'active', 'archived'];
}

function validSectionStatus(status) {
  return status in ['not_started', 'in_progress', 'complete'];
}

function validQuoteStatus(status) {
  return status in ['draft', 'sent', 'approved', 'rejected'];
}

function requiredKeysOnly(keys) {
  return request.resource.data.keys().hasOnly(keys);
}
```

Then apply them incrementally, starting with high-blast-radius docs:

1. `events/{eventId}`:
- Require `name`, `status`, `createdBy`.
- Validate `status`.
- Keep `createdBy` immutable.
- Keep server-owned Google fields write-restricted if clients should not set them directly.

2. `events/{eventId}/stages/{stageId}/advances/{advanceId}`:
- Require non-empty `artistName` and `createdBy`.
- Keep `createdBy` immutable.
- Block client changes to server-owned `driveFiles`.
- Validate `sections.*.status`.

3. `quotes/{quoteId}`:
- Require non-empty title and valid status.
- Validate line item numeric fields are nonnegative.
- Enforce valid status transitions where practical.
- Stamp decision fields through a callable if rules get too complex.

4. `scheduleItems/{itemId}`:
- Require valid section and title.
- Validate `includeInMaster` boolean.
- Restrict `googleCalendarEventId` to server/callable writes if intended.

**Test patch:** Extend `pwa/test/firestore.rules.test.ts` with malformed writes that currently pass:
- Invalid event status on update.
- Quote status set to arbitrary string.
- Negative quote line item.
- Advance missing/blank `artistName`.
- Schedule item with invalid section.
- Client write to calendar/Drive server-owned fields.

### P0. Implement Real Callable Contract Schemas

**Problem:** `pwa/contracts/schemas/callables/` claims to be the single source of truth, but the directory only has a README. Functions parse payloads manually and clients use inline `httpsCallable` TypeScript generics. This will create drift when mobile starts.

**Evidence:**
- Empty callable contracts: `pwa/contracts/schemas/callables/README.md`
- Client inline generics: `pwa/src/features/events/events-service.ts`, `pwa/src/lib/google/google-service.ts`, `pwa/src/lib/google/drive-service.ts`
- Manual parsing: `pwa/functions/src/index.ts`, `pwa/functions/src/google.ts`, `pwa/functions/src/googleDrive.ts`, `pwa/functions/src/googleSchedule.ts`

**Proposed patch:**

Create schema files:

```text
pwa/contracts/schemas/callables/
  auth.ts
  events.ts
  google.ts
  googleDrive.ts
  schedules.ts
  pdf.ts
  index.ts
```

Example:

```ts
import { z } from 'zod';

export const createEventFromTemplateInputSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().trim().min(1),
  startDate: z.number().nullable(),
  endDate: z.number().nullable(),
  venue: z.string().trim().nullable(),
});

export const createEventFromTemplateOutputSchema = z.object({
  eventId: z.string().min(1),
});

export type CreateEventFromTemplateInput = z.infer<typeof createEventFromTemplateInputSchema>;
export type CreateEventFromTemplateOutput = z.infer<typeof createEventFromTemplateOutputSchema>;
```

Use these on the server:

```ts
const input = createEventFromTemplateInputSchema.parse(request.data);
```

Use these on the client:

```ts
const callable = httpsCallable<CreateEventFromTemplateInput, CreateEventFromTemplateOutput>(
  functions,
  'createEventFromTemplate',
);
```

**CI patch:** Add a typecheck step that includes `contracts/` from both the PWA and Functions builds, or move contracts into a real workspace package before mobile begins.

### P0. Replace Stub Secret Health Check

**Problem:** Google OAuth Functions secrets are in use, but `verify-secrets-health.sh` still says no secrets are configured. The governance says this check must run before deploying functions.

**Evidence:**
- Secrets: `pwa/functions/src/google.ts`
- Stub health check: `pwa/scripts/cli/verify-secrets-health.sh`
- Function deploy predeploy only builds: `pwa/firebase.json`

**Proposed patch:**

1. Track required secrets in one place:

```bash
REQUIRED_SECRETS=(
  GOOGLE_OAUTH_CLIENT_ID
  GOOGLE_OAUTH_CLIENT_SECRET
)
```

2. Health check should:
- Confirm each required secret exists.
- Confirm each has at least one enabled/latest version.
- Inspect deployed Cloud Run revisions for destroyed secret versions where possible.
- Exit nonzero on missing/destroyed secret health failures.

3. Add a predeploy command for functions:

```json
"predeploy": [
  "./scripts/cli/verify-secrets-health.sh",
  "npm --prefix \"$RESOURCE_DIR\" run build"
]
```

4. Keep deploys manual and never include hosting in agent deploy commands.

### P1. Make CLI Wrappers Actually Sandbox-Safe and Use Them in Scripts

**Problem:** The wrapper docs promise pinned project and sandbox-safe config paths, but scripts only set project/update-check flags. Package scripts still invoke raw `firebase`, which conflicts with the wrapper requirement and caused emulator project warnings during rules tests.

**Evidence:**
- Wrapper promise: `AGENTS.md`
- Current wrappers: `pwa/scripts/cli/firebase-safe.sh`, `pwa/scripts/cli/gcloud-safe.sh`
- Raw package scripts: `pwa/package.json`

**Proposed patch:**

1. Add temp config/cache defaults in wrappers:

```bash
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp/46advance-config}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/46advance-cache}"
export CLOUDSDK_CONFIG="${CLOUDSDK_CONFIG:-/tmp/46advance-gcloud}"
export FIREBASE_CONFIG_DIR="${FIREBASE_CONFIG_DIR:-/tmp/46advance-firebase}"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$CLOUDSDK_CONFIG" "$FIREBASE_CONFIG_DIR"
```

2. Let emulator scripts opt into a demo project without touching production:

```bash
FIREBASE_PROJECT=demo-46advance ./scripts/cli/firebase-safe.sh emulators:exec --only firestore "vitest run --config vitest.rules.config.ts"
```

3. Update package scripts:

```json
"test:rules": "FIREBASE_PROJECT=demo-46advance ./scripts/cli/firebase-safe.sh emulators:exec --only firestore \"vitest run --config vitest.rules.config.ts\"",
"dev:emulator": "FIREBASE_PROJECT=demo-46advance ./scripts/cli/firebase-safe.sh emulators:start --only auth,firestore",
"emulators": "FIREBASE_PROJECT=demo-46advance ./scripts/cli/firebase-safe.sh emulators:start"
```

4. Decide whether emulators should run in `demo-46advance` or `advancethat`, then align `vitest.rules.config.ts`, `firebase.json`, and scripts to stop single-project warnings.

### P1. Align Hosted PDF Security With the Product Contract

**Problem:** The roadmap says hosted PDFs use signed, expiring links. The current function returns a Storage path, and the client calls `getDownloadURL`, which is Firebase token URL behavior rather than a 7-day signed URL.

**Evidence:**
- PDF path write: `pwa/functions/src/index.ts`
- Client URL resolution: `pwa/src/features/events/events-service.ts`, `pwa/src/features/events/quotes-service.ts`
- Roadmap claim: `planning/ROADMAP.md`

**Proposed patch options:**

Option A, real expiring URLs:
- Generate signed GCS URLs server-side with a 7-day expiration.
- Return `{ path, url, expiresAt }` from `generatePacket` and `generateQuotePdf`.
- Stop resolving generated PDFs via client `getDownloadURL`.

Option B, member-gated Firebase Storage URLs:
- Keep current path plus `getDownloadURL` behavior.
- Update roadmap and UI copy to say "member-gated Storage download URL" instead of "signed, expiring link".

**Recommendation:** Use Option A for external/shared links and Option B only for internal member downloads.

### P1. Make Attachment and Drive Writes Conflict-Safe

**Problem:** Attachment and Drive file arrays are updated by read-modify-write. Concurrent uploads/links can overwrite each other.

**Evidence:**
- Attachments: `pwa/src/features/events/production-service.ts`
- Drive files: `pwa/functions/src/googleDrive.ts`

**Proposed patch:**

1. Move attachment writes to a callable or Firestore transaction.
2. For client-side attachment metadata writes, use `runTransaction`.
3. For Drive file linking, wrap `existingFiles` plus `ref.set` in `db.runTransaction`.
4. Consider modeling files as subcollections:

```text
events/{eventId}/stages/{stageId}/advances/{advanceId}/driveFiles/{fileId}
events/{eventId}/production/record/attachments/{attachmentId}
```

Subcollections simplify concurrency, rules, deletion, and per-file audit fields.

### P1. Turn Mobile-Readiness Into Real Shared Contracts

**Problem:** `mobile/` is documentation-only. The repo says both apps consume shared contracts, but there is no implemented native app and no real shared schema package yet.

**Evidence:**
- `mobile/` contains only `AGENTS.md`
- `pwa/contracts/schemas/callables/` has no schemas

**Proposed patch:**

1. Rename the current state in docs from "mobile app" to "planned mobile app" until code exists.
2. Before native build-out, create a shared package:

```text
packages/contracts/
  src/callables/
  src/documents/
  package.json
  tsconfig.json
```

3. Import that package from `pwa/`, `pwa/functions/`, and future `mobile/`.
4. Keep SDK-specific timestamp conversion in app-specific adapters.

### P1. Restore Meaningful Coverage Gates

**Problem:** The docs promise 75% line/function and 70% branch coverage, but thresholds are disabled. Current line coverage is 24.65%.

**Evidence:**
- Coverage policy: `pwa/AGENTS.md`
- Disabled threshold note: `pwa/vite.config.ts`
- Current coverage report from 2026-06-25

**Proposed patch:**

1. Start with focused thresholds for high-value pure libraries:

```ts
coverage: {
  thresholds: {
    'src/lib/{advances,events,quotes,rbac,schedules}/**/*.{ts,tsx}': {
      lines: 85,
      functions: 85,
      branches: 75,
    },
  },
}
```

2. Add lower global thresholds that reflect the actual current state and ratchet monthly:

```ts
coverage: {
  thresholds: {
    lines: 25,
    functions: 22,
    branches: 80,
  },
}
```

3. Add service/callable tests next:
- Auth claim sync logic.
- Event/template callable validation.
- Google parser helpers.
- Storage upload validation.
- Rules negative cases.

### P1. Wire Sentry Before Production Use

**Problem:** Sentry is documented as a standing requirement, but `initSentry()` is a no-op.

**Evidence:**
- Stub: `pwa/src/lib/sentry.ts`
- Error boundary calls capture path: `pwa/src/components/AppErrorBoundary.tsx`
- Logger sink exists: `pwa/src/lib/logger.ts`

**Proposed patch:**

1. Install `@sentry/react` and `@sentry/vite-plugin`.
2. Implement `initSentry()`:
- `sendDefaultPii: false`
- environment/release tags
- `setGlobalLogSink` breadcrumbs for debug/info/warn
- `captureException` for error
3. Add source-map upload only when token is present.
4. Add one test or smoke check that the logger sink gets set when DSN is present.

### P2. Add Route-Level Lazy Loading

**Problem:** The app imports all screens eagerly, and the production build emits a large main chunk. This conflicts with the PWA rule that routing uses lazy code splitting.

**Evidence:**
- Eager imports: `pwa/src/App.tsx`
- Build warning: main chunk about 955 KB minified

**Proposed patch:**

1. Replace route screen imports with `React.lazy`.
2. Add a small route-level suspense fallback.
3. Optionally group chunks by feature:

```ts
const EventsListScreen = lazy(() => import('@/features/events').then((m) => ({ default: m.EventsListScreen })));
```

4. Re-run build and compare chunk sizes.

### P2. Add Dependency Audit Governance

**Problem:** Dependabot exists, but current functions dependencies fail a moderate audit threshold through transitive Google/Firebase dependencies.

**Evidence:**
- `npm audit --audit-level=moderate` in `pwa/functions/` fails.
- Dependabot config: `.github/dependabot.yml`

**Proposed patch:**

1. Add a scheduled audit workflow separate from PR CI to avoid noisy blocking on unavoidable transitives.
2. Track accepted transitive advisories in a small security exceptions file with review dates.
3. Evaluate whether bumping `googleapis` and Firebase Admin can resolve the `uuid` advisory without breaking functions.

### P2. Clean Up Stale Governance Docs

**Problem:** Root and PWA agent docs still read like a pre-Phase-1 greenfield scaffold in several places, while planning says execution Phases 0-13 have shipped.

**Evidence:**
- Root `AGENTS.md` status and TBD language.
- `pwa/AGENTS.md` project status says Phase 1 is next.
- `planning/ROADMAP.md` and `planning/BUILD_PLAN.md` say many phases are built.

**Proposed patch:**

1. Update root and PWA `AGENTS.md` statuses to "PWA active build; native planned".
2. Remove or mark resolved TBDs where code has decided the answer.
3. Keep true open questions in the roadmap only.
4. Update `planning/README.md` when this remediation plan is completed and archived.

## Additional Findings — Phase-Completion Audit (2026-06-25)

A per-phase audit of execution Phases 0–13 (does the code match each phase's claimed exit
criteria?) confirmed several items above (PDF signed-link gap → P1; admin bootstrap → P0; empty
callable contracts → P0; stale governance docs → P2; Sentry/coverage → P1) and surfaced these
**net-new** items not otherwise covered here. (It also reconciled docs to reality: licensed
**Nexa/Hikou** self-hosted fonts + `#0a0a0a` brand token across ROADMAP/BUILD_PLAN/`pwa/AGENTS.md`.)

### P1. Rate-Limit External-API Callables  *(in progress — `fix/rate-limit-callables`, 2026-06-25)*

**Problem:** No callable is rate-limited. `.claude/rules/security.md` mandates
`checkFirestoreRateLimit()` on all external-API/abuse-sensitive callables, and `PHASE_13_PLAN.md`
explicitly required it for the Drive callables — but the limiter utility was never created and no
function calls it.

**Evidence:**
- No limiter: `pwa/functions/src/lib/security/` does not exist (only `lib/pdf/`).
- Unprotected callables: `pwa/functions/src/google.ts`, `googleDrive.ts`, `googleBookings.ts`, `googleSchedule.ts`, and `index.ts` (`generatePacket`, `generateQuotePdf`, `createEventFromTemplate`).

**Proposed patch:**
1. Create the canonical distributed limiter `pwa/functions/src/lib/security/firestoreRateLimit.ts` (`checkFirestoreRateLimit(db, key, limit, windowMs)` — fixed-window counter in a `rateLimits/{key}` doc via transaction) + `rateLimit.ts` (`makeRateLimitKey`).
2. Apply per-user limits to the OAuth/Calendar/Drive/Schedule/PDF callables **before** the external call.
3. Unit-test the limiter; the two files are already listed in the `AGENTS.md` canonical-sources table as "create on first use".

### P2. Complete the Phase-0 Scaffold Canon

**Problem:** Several Phase-0 deliverables named in `PHASE_0_PLAN.md` + the `AGENTS.md`
canonical-sources table were never created, so the table points at absent files.

**Evidence / missing files (under `pwa/`):**
- `src/config/endpoints.ts`, `src/config/featureFlags.ts`, `src/config/security.ts` (only `integrations.ts` exists).
- `src/lib/styles/variants.ts` (the `lib/styles/` dir is absent).
- `src/testing/firebaseMocks.ts`, `src/testing/mockFactories.ts` (only `setup.ts`).
- `.editorconfig`.
- `/__theme` specimen route ships to production — gate behind `import.meta.env.DEV` (`src/App.tsx`).
- No **staging** deploy workflow (only `production-deploy.yml`).

**Proposed patch:** Create the files on next real use (don't scaffold empty stubs), prune the
canonical-sources table for anything intentionally dropped, dev-gate `/__theme`, and add a staging
workflow (or note staging is folded into the manual hosting workflow).

### P2. Small Feature/UX Gaps

Low-severity gaps vs. plan/exit criteria:
- **Password reset:** `sendPasswordReset` exists but has **no UI** (no forgot-password link/route).
- **Departments admin:** UI is create+delete only — `updateDepartment` (rename) and order editing are unused; "CrD" not full CRUD.
- **Events list:** status filter only — the planned **text search** is missing.
- **Template stages:** no reorder control (order derived from list position).
- **Default departments:** seeds **7** (adds `staging`) vs the locked **6** — amend the §4 decision or the seed.

> Per-department/per-stage **PDF packet variants** (Phase 7 follow-up) are tracked as a product
> backlog item in `BUILD_PLAN.md` (Later / backlog), distinct from the P1 PDF *link* fix above.

## Suggested Implementation Order

1. Backend access gate: approved-user rules plus tests.
2. Admin bootstrap identity/config.
3. Real secret health check.
4. Callable schemas for all current functions.
5. Firestore shape/state validation in rules.
6. Wrapper and emulator script cleanup.
7. PDF link contract decision and implementation.
8. Attachment/Drive concurrency fix.
9. Coverage/Sentry/lazy-routing polish.
10. Documentation cleanup.

## Branching Recommendation

Use separate branches so each change is reviewable:

| Branch | Scope |
| --- | --- |
| `fix/approved-access-rules` | Approved claim enforcement and rules tests. |
| `fix/admin-bootstrap-config` | Admin allowlist config and docs. |
| `fix/secrets-health-check` | Real deploy secret health check. |
| `feature/callable-contract-schemas` | Shared callable Zod schemas. |
| `fix/firestore-shape-validation` | Rules validators and negative tests. |
| `chore/cli-wrapper-alignment` | Wrapper temp paths and package script changes. |
| `fix/pdf-link-contract` | Signed URL or documentation alignment. |
| `fix/file-array-concurrency` | Transactions/subcollections for attachments and Drive files. |
| `chore/quality-ratchet` | Coverage gates, Sentry, lazy routes, audit workflow. |
| `fix/rate-limit-callables` | Distributed rate limiter + apply to all callables. |

## Acceptance Criteria

The remediation is complete when:

- Pending/revoked users are blocked by backend rules, not just UI.
- There is at least one real callable schema file per callable domain, imported by server and client.
- Functions deploys run a non-stub secret health check before build/deploy.
- Package scripts no longer require raw `firebase` commands for normal emulator/rules workflows.
- Rules tests include negative malformed-document cases for every shared document type.
- The PDF link behavior matches the documented security model.
- Coverage thresholds are explicit, even if initially modest.
- Root/PWA/mobile governance docs describe the actual current state.
