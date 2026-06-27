# 46 Advance — Web App (PWA)

Primary web client for 46 Entertainment, running as a Progressive Web App.

> **Status:** Active build. The PWA is implemented through execution phases 0–13
> (auth/RBAC, events, advances, production, templates, PDF packets, tracker, quotes,
> contacts, Google Calendar/Meet/Drive, schedules) on the Firebase project
> `advancethat`, and the foundation remediation is complete. The native app is
> planned, not yet built. A few `<!-- TBD -->` placeholders remain for genuinely
> open details — do not invent values to fill them.

> **See `../AGENTS.md` for shared/workspace rules**: cross-app coordination,
> Firebase backend, CLI tooling, secrets, staging deploys, git workflow,
> parallel-agent safety, plan-mode approval, MCP token efficiency, and the Issues
> Log. This file covers web-only concerns: stack, project structure, code
> patterns, and discovery protocol.

## Tech Stack

- **Framework**: React 19 with TypeScript 5.9 (strict mode)
- **Build**: Vite 7 with PWA support
- **State**: React Query v5 for server state, Context for global UI state
- **Database**: Firebase Web SDK (Firestore, Auth, Functions, Storage)
- **Styling**: Tailwind CSS 4 — **46 brand theme** (dark chrome + light content; tokens `#0a0a0a`/`#f04040`, fonts **Nexa + Hikou** (licensed, self-hosted), status neutral→amber→green). Tokens in `src/index.css`; see planning/ROADMAP.md § UI.
- **Routing**: React Router v7 with lazy code splitting
- **Validation**: Zod for runtime validation
- **Testing**: Vitest (unit), Playwright (E2E)

## Project Structure

The target structure mirrors the sibling project's proven layout. Feature modules
and types are created as the design firms up — the tree below is the *convention*,
not a claim that these directories exist yet.

```text
src/
├── features/           # Feature modules (preferred for all new code)
│   └── <feature>/      # index.ts (barrel), components/, hooks/, lib/, types/
│                       # <!-- TBD: feature modules defined during planning -->
├── components/         # Shared/legacy components
├── config/             # App config (endpoints, integrations, feature flags, security)
├── contexts/           # React Context providers
├── hooks/              # Shared React hooks
├── lib/                # Core utilities & services
│   ├── dates/         # Date formatting, calculations, parsing
│   ├── firestore/     # Timestamp helpers, validation utilities
│   ├── hooks/         # Shared lib hooks (e.g. useModalState)
│   ├── security/      # Frontend security utilities
│   └── styles/        # Variant-based styling system
├── routes/             # Route components
├── shared/             # Shared hooks and type re-exports
├── testing/            # Test infrastructure (mock factories, Firebase mocks)
├── types/              # Canonical TypeScript definitions
└── services/           # Cross-feature services

functions/              # Firebase Cloud Functions — SHARED BACKEND (serves both apps)
└── src/
    ├── handlers/      # Handler files grouped by domain
    ├── lib/           # Shared backend utilities (rate limiting, security)
    ├── types/         # Backend type definitions
    └── wiring/        # Function registration & export wiring

contracts/              # Shared callable schemas (consumed by both apps)
└── schemas/callables/  # Zod schemas for Cloud Function callables
```

## Essential Commands

Expected scripts once `package.json` is scaffolded (mirrors the sibling project):

```bash
# Core workflow
npm run dev              # Start dev server (strict port)
npm run build            # Production build
npm run typecheck        # TypeScript validation (tsc --noEmit)
npm run lint             # ESLint check
npm run test             # Run Vitest unit tests (jsdom)
npm run test:rules       # Firestore security-rules tests (Firestore emulator; needs Java)
npm run test:e2e         # Playwright E2E tests

# Quality
npm run lint:fix         # Auto-fix ESLint violations (see auto-fix safety in ../AGENTS.md)
npm run format           # Prettier formatting
npm run arch:check       # Dependency architecture check (dependency-cruiser)

# Emulators
npm run dev:emulator     # Auth (9099) + Firestore (8080) only
npm run emulators        # Full suite (+ Functions 5001, Storage 9199, Hosting 5000)

# Deployment (see ../AGENTS.md for full safety rules)
# HOSTING DEPLOYS ARE FORBIDDEN — managed externally, never deploy hosting
./scripts/cli/firebase-safe.sh deploy --only functions         # Cloud Functions (requires confirmation)
./scripts/cli/firebase-safe.sh deploy --only firestore:rules   # Firestore rules (requires confirmation)
```

## Code Style

- Functional components with hooks only
- Named exports preferred
- PascalCase for component files, camelCase for utilities
- Feature-based organization for all new code
- Tailwind utility classes (no CSS files)
- Zod schemas for runtime validation

### Import order

1. React and external libraries
2. Internal components and hooks (`@/`)
3. Types and utilities
4. Relative imports

### TypeScript rules

- **Zero `any` types** — use `unknown`, `DocumentData`, or proper interfaces (enforced by the `block-any-types` hook)
- Use utility types: `Partial<T>`, `Pick<T, K>`, `Omit<T, K>`, `Record<K, V>`
- Use type guards for runtime type checking
- Canonical type definitions live in `src/types/` — all other locations import from there
- Run `npm run typecheck` before every commit

### Responsive design

- Mobile-first with Tailwind breakpoints: `sm:` → `md:` → `lg:` → `xl:`
- Minimum 44px touch targets for mobile/PWA
- Use responsive grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`

## Code Patterns

### Feature module structure

```typescript
// features/[name]/index.ts — barrel export
export { Component } from './components';
export { useHook } from './hooks';
export { utility } from './lib';
```

### React Query hooks

```typescript
function useThings(filters?) {
  return useQuery({ queryKey: ['things', filters], queryFn: () => fetchThings(filters) });
}

function useAddThing() {
  return useMutation({
    mutationFn: createThing,
    onSuccess: () => queryClient.invalidateQueries(['things']),
  });
}
```

### Styling with variants

```typescript
import { button } from '@/lib/styles/variants';
<button className={button('primary', 'md')}>Click</button>
```

### Logging

```typescript
import { createLogger } from '@/lib/logger';
const logger = createLogger('FeatureName');
logger.info('message');
logger.error('message', error);
// NEVER use console.log — always use createLogger()
```

### Firestore timestamps

```typescript
import { timestampToDate, dateToTimestamp } from '@/lib/firestore/timestamps';
// Always convert between Firestore timestamps and JS Dates
```

## Code Discovery Protocol

Before searching the codebase, consult the index. Blind grep/glob searches waste
time and tokens. As the codebase grows, keep this index current.

### Step 1: Check the canonical sources table

`.claude/rules/code-organization.md` holds the verified table of every shared
utility, its exact file path, and its exports. Before creating or searching for
any utility, type, hook, or pattern — check the table first. The table below
lists the **infrastructure** canonical sources expected on this stack; create
each on first use and keep the table updated. Domain-specific canonical sources
(permissions, business rules) are **TBD** and added during planning.

| Concept               | Canonical Location (create on first use)                 |
| --------------------- | -------------------------------------------------------- |
| Date formatting       | `src/lib/dates/formatting.ts`                            |
| Date calculations     | `src/lib/dates/calculations.ts`                          |
| Date parsing          | `src/lib/dates/parsing.ts`                               |
| Error capture         | `src/lib/errorCapture.ts`                                |
| Logging               | `src/lib/logger.ts`                                      |
| Rate limiting (distributed) | `functions/src/lib/security/firestoreRateLimit.ts` (backend — default) |
| Rate limiting (in-memory)   | `functions/src/lib/security/rateLimit.ts` (backend — low-stakes paths) |
| Firestore timestamps  | `src/lib/firestore/timestamps.ts`                        |
| File uploads (Storage) | `src/lib/storage/uploads.ts` (validate + upload/delete) |
| Type definitions      | `src/types/`                                             |
| Modal state           | `src/lib/hooks/useModalState.ts`                         |
| Variants/styles       | `src/lib/styles/variants.ts`                             |
| Config: endpoints     | `src/config/endpoints.ts`                                |
| Config: integrations  | `src/config/integrations.ts`                             |
| Config: feature flags | `src/config/featureFlags.ts`                             |
| Config: security      | `src/config/security.ts`                                 |
| Test mocks: Firebase  | `src/testing/firebaseMocks.ts`                           |
| Test mocks: domain    | `src/testing/mockFactories.ts`                           |
| Shared callable schemas | `functions/src/contracts/callables/` (pure Zod; server `.parse` via `functions/src/lib/parseCallable.ts`, client via the `@contracts` alias) |
| RBAC roles + schemas  | `src/lib/rbac/roles.ts` (cross-feature → shared lib)     |
| Permission checks     | `src/lib/rbac/permissions.ts` (pure predicates)          |
| Per-event membership IO | `src/lib/rbac/membership.ts`                           |
| Event/festival model  | `src/lib/events/event.ts` (type + Zod + parser)          |
| Stage model           | `src/lib/events/stage.ts` (type + Zod + parser)          |
| Departments (config)  | `src/lib/departments/` (`department.ts` + `departments-service.ts`) |
| Advance model         | `src/lib/advances/advance.ts` (type + Zod + parser)      |
| Advance section state machine | `src/lib/advances/sections.ts` (keys, status, finalize/unlock) |
| Advance content fields (registry) | `src/lib/advances/fields.ts` (per-department FieldDef sets) |
| Templates (blueprints) | `src/lib/templates/` (`template.ts` + `templates-service.ts`) |
| Users directory (read) | `src/lib/users/users-service.ts`                         |
| Production form components (shared) | `src/components/production/` (SectionContentForm, contacts/links editors) |
| Advance tracker (read-model) | `src/lib/tracker/` (`tracker.ts` pure roll-up + `tracker-service.ts` reads) |
| Quote/estimate model | `src/lib/quotes/quote.ts` (type + Zod + totals/lifecycle helpers) |
| Quotes data access | `src/features/events/quotes-service.ts` (CRUD, status, signed copy, PDF) |
| Contact model | `src/lib/contacts/contact.ts` (type + Zod + tel/mailto helpers) |
| Contacts directory (read/write) | `src/lib/contacts/contacts-service.ts` (global `contacts/{id}`) |
| Event contact attachments | `src/features/events/event-contacts-service.ts` (per-event join) |
| Contact links (tap-to-call/email) | `src/components/contacts/ContactLinks.tsx` |
| iCalendar (.ics) builder | `src/lib/calendar/ics.ts` (pure VEVENT + download) |
| Google Calendar/Meet (client) | `src/lib/google/` (`google-service.ts` callables + status, `useGoogleConnection.ts`, `bookings-service.ts`, `callBooking.ts`) |
| Google Calendar/Meet (backend) | `functions/src/google.ts` (per-user OAuth + Meet creation), `functions/src/googleBookings.ts` (Appointment-Schedule booking sync + cron) |
| Timezone (Central, DST-aware) | `src/lib/dates/timezone.ts` (`APP_TIME_ZONE`, wall-clock ⇄ UTC, `formatCentralDateTime`/`Date`/`Time`, `centralDayKey`) |
| Schedules model + sections | `src/lib/schedules/` (`scheduleItem.ts` type+Zod+parser, `sections.ts` 6-section field registry) |
| Schedules data access | `src/features/events/schedule-service.ts` (CRUD + calendar push/remove; `EventScheduleScreen` at `/events/:id/schedule`) |
| Schedules calendar push (backend) | `functions/src/googleSchedule.ts` (`pushScheduleItem` reconcile + `removeScheduleCalendarEvent`; reuses 11b) |
| Google Drive (client) | `src/lib/google/drive-service.ts` (link/remove/savePacket callables + Picker), `driveFile.ts` (`DriveFileRef` type+Zod); Picker keys in `src/config/integrations.ts` |
| Google Drive (backend) | `functions/src/googleDrive.ts` (`linkDriveFile`/`removeDriveFile`/`savePacketToDrive`/`getDriveAccessToken`; `drive.file` scope, reuses 11b) |

### Step 2: Resolve name variants before searching

Maintain `docs/architecture/FEATURE_NAME_CROSSWALK.md` (create when features
exist) to map alternate names and shorthand to canonical directories. If a prompt
uses a term missing from the crosswalk that you can confidently resolve, add it in
the same task.

### Step 3: Identify the feature module

All domain code lives in `src/features/<name>/` with `components/`, `hooks/`,
`lib/`, and an `index.ts` barrel.

### Step 4: Check the rules

`.claude/rules/` contains path-scoped rules applied automatically based on the
files you modify: `code-organization.md`, `type-safety.md`, `security.md`,
`firebase.md`, `testing.md`, `mcp-usage.md`.

### Step 5: Search only when the index doesn't cover it

Start narrow (the specific feature directory), then shared libraries
(`src/lib/`, `src/hooks/`, `src/types/`), then project-wide as a last resort.

## Important Rules

- ALWAYS run `npm run typecheck` before committing
- ALWAYS use existing patterns from similar components
- ALWAYS search first, write second — check for existing implementations before creating new utilities, hooks, or types
- ALWAYS extract to a shared utility when code appears 3+ times — don't defer to a future refactor
- ALWAYS check if documentation needs updating when a change adds/removes/moves features, modifies APIs, changes behavior, renames files, or alters structure — update the relevant doc in the same session
- ALWAYS check the sibling app (`../mobile/`) when modifying Cloud Functions, Firestore document shapes, security rules, or auth claims — see `../AGENTS.md` § Cross-App Coordination
- NEVER commit `.env` files or secrets
- NEVER create re-export wrapper files — import from canonical sources directly
- Use React Query for all server state (not `useState` for async data)
- Use `createLogger()` for logging, never `console.log`
- Convert Firestore timestamps with helper utilities
- Default timezone: **Central (`America/Chicago`)** — all advance-call times. Convert/format via `src/lib/dates/timezone.ts`; never rely on the browser's local zone. Store instants as UTC (`Timestamp`).
- Rate-limit external API calls and abuse-sensitive endpoints: default to `checkFirestoreRateLimit()` (distributed); `checkRateLimit()` is reserved for low-stakes, latency-sensitive paths
- Error capture: use `src/lib/errorCapture.ts`; route through the logger so the Sentry integration stays the one place that knows about the SDK

## PWA & Service Worker

The app runs as a PWA via `vite-plugin-pwa` (Workbox). Configure registration as
`prompt` (user-controlled updates), `skipWaiting: false`, `clientsClaim: false`,
`display: standalone`. <!-- TBD: finalize manifest name/icons, cache strategies, and navigation fallback during build-out. -->

### Stale cache recovery (pattern to carry forward)

After deploys, stale dynamically-imported chunks must self-heal. Implement layered
recovery: a lazy-import retry wrapper, an error boundary that catches "Failed to
fetch dynamically imported module", and an inline HTML global handler. All paths
follow the same strategy: clear SW caches → unregister service workers → delete
IndexedDB → hard reload.

## Third-Party API Integration

When the design introduces an external API, follow this pattern (placeholders
until an integration is chosen):

| Setting | Value |
| ------- | ----- |
| Base URL | `<!-- TBD -->` |
| Auth | Token via Firebase Functions Secret Manager (see `../AGENTS.md` § Secrets) |
| Rate limiting | Required — `checkFirestoreRateLimit()` before the call |
| Secrets definition | `functions/src/config/secrets.ts` |

## Running Scripts That Need Secrets

Scripts in `scripts/` read secrets from environment variables. Firebase Admin auth
comes from ADC (preferred) or a fallback key file.

```bash
gcloud auth application-default login          # one-time; applicationDefault() picks it up
export $(grep -v '^#' .env.local | grep -v '^VITE_' | xargs)   # other secrets
node --import tsx scripts/<script>.ts
```

## Testing Requirements

- Coverage thresholds: a ratchet — a low global floor + high per-dir bars on the pure libs, enforced in `vite.config.ts` and CI (see `.claude/rules/testing.md`)
- Unit tests: `*.test.ts`, `*.test.tsx` (colocated)
- E2E tests in `tests/` at project root
- Run `npm run test` before pushing

## Changelog

`CHANGELOG.md` (workspace root) follows [Keep a Changelog](https://keepachangelog.com/).
Update `[Unreleased]` for user-facing work — **Added** / **Changed** / **Fixed**.
Use a bold feature-name prefix. Internal-only changes (test infra, tooling, docs)
don't need entries unless they affect UX. Mobile user-facing changes also go here,
prefixed `(Mobile)`.

## Standing Quality Practices

Long-lived A+ engineering practices (file-size thresholds, performance
expectations, compliance sweeps, dead-code standards) should live in
`docs/architecture/A_PLUS_ENGINEERING_PRACTICES.md` <!-- TBD: port/author this doc during planning -->.
Trigger phrases like "compliance sweep", "audit the codebase", "security audit",
and "docs are stale" map to that guide and the agents in `.claude/agents/`.

## Compliance & Hooks

Rules in `.claude/rules/` are enforced automatically by path scope. The
`compliance-checker` agent (`.claude/agents/compliance-checker.md`) audits any
scope for violations. Hooks in `.claude/hooks/` provide deterministic enforcement
at tool-call boundaries. These rules are non-negotiable unless the user explicitly
requests an override for a specific case.

### Documentation freshness

After significant changes, verify affected docs are still accurate. The `docs-sync`
agent (`.claude/agents/docs-sync.md`) audits documentation against the codebase.
Keep current: `../CHANGELOG.md`, `../AGENTS.md`, this `AGENTS.md`,
`.claude/rules/*.md`, and auto-memory (`MEMORY.md`).

## Project Status

PWA in active build: execution phases 0–13 shipped (see `planning/ROADMAP.md` for what
landed, `planning/BUILD_PLAN.md` for the original order) and the foundation remediation
is complete (`planning/archive/fix/FOUNDATION_REVIEW_REMEDIATION.md`). The native app is
planned, not yet built.
