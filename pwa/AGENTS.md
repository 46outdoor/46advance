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
- **Styling**: Tailwind CSS 4 — **46 brand theme** (dark chrome + light content; tokens `#0a0a0a`/`#f04040`, fonts **Poppins** (OFL, body) **+ Hikou** (licensed, all-caps display — headings only; see `guides/FONT_LICENSES.md`), self-hosted, status neutral→amber→green). Tokens in `src/index.css`; see planning/ROADMAP.md § UI.
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
│   ├── hooks/         # Shared lib hooks (currently useBeforeUnload)
│   ├── security/      # Frontend security utilities
│   └── styles/        # Variant-based styling system
├── routes/             # Route components
├── shared/             # Shared hooks and type re-exports
├── testing/            # Test infrastructure (mock factories, Firebase mocks)
├── types/              # Canonical TypeScript definitions
└── services/           # Cross-feature services

functions/              # Firebase Cloud Functions — SHARED BACKEND (serves both apps)
└── src/
    ├── index.ts       # Entry: initializeApp + admin/event/PDF callables + re-exports
    ├── google*.ts     # Domain handler modules (google, googleBookings, googleDrive)
    ├── contracts/     # Shared callable Zod schemas (contracts/callables/*) — client via `@contracts`
    └── lib/           # Backend utilities: auth/ (authorize, allowlist), security/ (rate limits),
                       #   db/ (chunkedBatch), dates/ (zonedTime), events/, pdf/
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
# From functions/: npm run test:emulator — callable handler tests (Auth+Firestore emulators; needs Java)

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
| Callable error → user message | `src/lib/errors/callableError.ts` (`describeCallableError` — surface HttpsError messages; friendly rate-limit line; fallback on opaque/`internal`) |
| Logging               | `src/lib/logger.ts`                                      |
| Observability (Sentry) | `src/lib/sentry.ts` (`initSentry` — inert until `VITE_SENTRY_DSN`; logger.error → event, WS-I/F-12); activation + required secrets in `guides/OBSERVABILITY.md` |
| Rate limiting (distributed) | `functions/src/lib/security/firestoreRateLimit.ts` (backend — default) |
| Rate limiting (in-memory)   | `functions/src/lib/security/rateLimit.ts` (backend — low-stakes paths) |
| Chunked Firestore batch (backend) | `functions/src/lib/db/chunkedBatch.ts` (`ChunkedBatch` / `BatchLike` — auto-splits >400-op seeds/cleanups under the 500 cap) |
| Firestore timestamps  | `src/lib/firestore/timestamps.ts`                        |
| File uploads (Storage) | `src/lib/storage/uploads.ts` (validate + upload/delete) |
| Type definitions      | `src/types/`                                             |
| Modal state           | `src/lib/hooks/useModalState.ts` — **not created yet.** Aspirational per "create on first use"; `src/lib/hooks/` currently holds only `useBeforeUnload.ts`. Don't cite it as existing |
| Before-unload guard   | `src/lib/hooks/useBeforeUnload.ts` (warn on hard tab-close while a flag is true — e.g. an in-flight upload) |
| Variants/styles       | `src/lib/styles/variants.ts`                             |
| Config: endpoints     | `src/config/endpoints.ts`                                |
| Config: integrations  | `src/config/integrations.ts`                             |
| Config: feature flags | `src/config/featureFlags.ts`                             |
| Config: security      | `src/config/security.ts`                                 |
| Global test setup     | `src/testing/setup.ts` (jsdom `matchMedia` shim; wired via `vite.config.ts` → `setupFiles`) |
| Firestore mocking (client tests) | Per-file idiom, not a shared factory: `vi.mock('@/services/firebase', () => ({ db: {} }))` + a spread-`importActual` mock of `firebase/firestore` stubbing only the IO entry points, so `Timestamp` stays real for the Zod schemas. Reference: `src/lib/rbac/membership.test.ts`, `src/lib/templates/templates-service.test.ts` |
| Functions handler test harness | `functions/src/testing/emulatorHarness.ts` (wrap callables vs live Auth/Firestore emulators; run via `test:emulator`) |
| Authenticated E2E (emulator) | `tests/emulator/` (deterministic personas + REST seeder + Playwright sign-in/isolated-context fixtures; run via `test:e2e:emulator`, or `test:e2e:emulator -- <filter>` for one spec; demo-46advance only). A CI gate — see `tests/emulator/README.md` for the browser-install caveat |
| Shared callable schemas | `functions/src/contracts/callables/` (pure Zod; server `.parse` via `functions/src/lib/parseCallable.ts`, client via the `@contracts` alias) |
| RBAC roles + schemas  | `src/lib/rbac/roles.ts` (cross-feature → shared lib; member docs carry `departments` + denormalized `email`/`displayName`) |
| Permission checks (global directories) | `canBrowseGlobalDirectories` in `src/lib/rbac/permissions.ts` — the contacts directory + artist document library (`/contacts`, `/documents`): admin ∨ organizer ∨ director ∨ coordinator. Mirrored server-side by the same-named predicate in `functions/src/lib/auth/authorize.ts` and by the `contacts`/`artistDocuments` read rules in `firestore.rules`. ⚠ Takes NO per-event role — a global collection's rules gate cannot see one, which is why a PM who needs the directory holds `organizer` (`planning/ACCESS_SCOPING_PLAN.md` decision 1). Route guard: `src/components/CapabilityGate.tsx` |
| Permission checks     | `src/lib/rbac/permissions.ts` (pure predicates, incl. `canEditDepartment`/`canManageMembers`/`canOverseeAllEvents`/`canViewTracker`/`canManageContact` — the last is the global contacts directory's edit/delete gate: admin, production director, or the creator — plus the crew-logistics set: `canManageCrewLogistics` (admin/PM/**coordinator** write), `canViewAllCrewLogistics` (read superset + director), and `canManageCrewRoster`/`canManageScheduleDays` (admin/PM/coordinator — the coordinator's other two event-scoped writes). `canOverseeAllEvents` = admin ∨ director ∨ **production coordinator** since Phase 2) |
| Viewer construction (global capabilities) | `src/lib/rbac/useViewer.ts` (`useViewer()` → `Viewer \| null`, null exactly when signed out; `ANONYMOUS_VIEWER` for the deliberate signed-out render). ⚠ **Never hand-build a `Viewer` literal in a component** — every capability flag on `Viewer` is optional, so omitting one compiles cleanly and silently denies that whole population. That shipped once (`EventContactsPanel` missed `isProductionCoordinator`); this hook is the fix, and a new capability is added here, not swept across ~13 screens |
| Per-event membership IO | `src/lib/rbac/membership.ts` (`getEventMember`/`getEventRole`/`listEventMembers` + `eventMembersKey`) |
| Cross-event membership summary | `src/lib/rbac/my-memberships.ts` (`listMyEventMemberships` self-only collection-group read → `{eventId, role}[]` + `myEventMembershipsKey`) and the shared hook `src/lib/rbac/useMyEventMemberships.ts`. **Distinct from `membership.ts`** — that answers "my role on THIS event", this answers "every event I'm on, with roles". One query shared by AppShell / Events / Tracker / the Calendar Feed picker; don't reintroduce a role-discarding `collectionGroup('members')` read at a call site |
| Membership writes (PM-facing) | `src/features/events/event-members-service.ts` (assign/remove/tech-auto-enroll callable wrappers) + `functions/src/members.ts` (`assignEventMember`/`removeEventMember` — PM-or-admin gate, add-by-email, `ifAbsent`); Team UI `src/features/events/EventTeamPanel.tsx` |
| Callable authorization (approved gate) | `functions/src/lib/auth/authorize.ts` (`assertApproved`/`assertAdmin`/`assertCanReadEvent` — Admin-SDK callables re-assert the rules' `isActiveUser`/admin gates; `assertCanReadEvent` mirrors the rules' `canReadEvent` = admin ∨ productionDirector ∨ productionCoordinator ∨ membership). ⚠ The matching **write** gate `assertCanEditEvent` still lives in `functions/src/google.ts` for historical reasons — the two event gates are split across files; consolidating means moving it and updating 6 importers |
| Event slug/id resolution (hook) | `src/features/events/useResolvedEvent.ts` (resolve a slug-or-id route param → canonical event; key sub-queries on `event.id`) |
| Event slug reservation (server, WS-G) | `functions/src/lib/events/slug.ts` (`reserveEventSlug`/`findFreeSlug` transactional claim against the `slugs/{slug}` collection — locked server-only) + `functions/src/eventSlug.ts` (`renameEventSlug` callable). Client rename wrapper: `renameEventSlug` in `src/features/events/events-service.ts` |
| PWA stale-chunk recovery | `src/lib/pwa/recovery.ts` (`isDynamicImportError`/`recoverFromStaleChunk`) + `src/lib/pwa/lazyWithRetry.tsx` (resilient lazy routes) |
| Event/festival model  | `src/lib/events/event.ts` (type + Zod + parser)          |
| Event reads (shared)  | `src/lib/events/events-read.ts` (`listEvents`/`getEvent` — in `lib/` because more than one feature reads events and a feature may not import another feature; **writes** stay in `src/features/events/events-service.ts`) |
| Stage model           | `src/lib/events/stage.ts` (type + Zod + parser)          |
| Departments (config)  | `src/lib/departments/` (`department.ts` + `departments-service.ts`) |
| Festivals (config)    | `src/lib/festivals/` (`festival.ts` model + `festivals-service.ts` CRUD; admin-managed name + logo; events reference `festivalId`) — admin UI `src/features/admin/FestivalsAdmin.tsx` |
| Advance model         | `src/lib/advances/advance.ts` (type + Zod + parser)      |
| Advance section state machine | `src/lib/advances/sections.ts` (keys, status, finalize/unlock) |
| Advance content fields (registry) | `src/lib/advances/fields.ts` (per-department FieldDef sets) |
| Lineup helpers (day-aware slots) | `src/lib/advances/lineup.ts` (`buildSlotArtistLookup` for `{artist N}`, `performanceDayKey`, `advanceHasData`/`advanceDataSummary`); slot-first editing UI in `src/features/events/LineupPanel.tsx` |
| Templates (blueprints) | `src/lib/templates/` (`template.ts` + `templates-service.ts`; `isDefault` flags the master house package — `getDefaultTemplate` reads it, `setDefaultTemplate` enforces at-most-one via a batch that clears the rest) |
| Template push to existing events | `src/lib/templates/template-push-service.ts` (callable wrapper + `PUSH_TARGET_LIMIT`) + `src/features/templates/PushToEventsPanel.tsx` (sections → explicit targets → preview → confirm; resolves field labels via `src/lib/advances/fields.ts`). Backend: `functions/src/templatePush.ts` (`pushTemplateProduction` — admin-only, rate-limited, one `dryRun`-flagged callable for both preview and apply; merge writes, stages matched by name) |
| Brand logos (model + helpers) | `src/lib/branding/logo.ts` (`Logo` dual-variant type + `logoForBackground`). ⚠ There is deliberately **no** `effectiveLogos` — one existed, drove nothing, and was a trap; see the tombstone comment in that file before reintroducing anything like it. Row layout lives in `src/components/branding/LogoRow.tsx` |
| Brand defaults config | `src/lib/branding/branding-service.ts` (`config/branding` shared default marks) |
| Packet filename config | `src/lib/packets/packet-config-service.ts` (client read/write) + `functions/src/lib/pdf/packetFilename.ts` (`formatPacketFilename`/`packetBaseName` — server fills tokens + sanitizes) — admin-set `config/packets` naming convention |
| Logo UI (upload + display) | `src/components/branding/` (`LogoUploader` dual-variant, `LogoRow` theme-aware) |
| Admin tabs (registry + deep links) | `src/lib/admin/tabs.ts` (`ADMIN_TABS`/`parseAdminTab`/`adminTabPath` — in `lib/` so other features can deep-link to `/admin?tab=…` without importing `features/admin`; ids are public URLs, don't rename) |
| Nav registry (app chrome) | `src/lib/nav/items.ts` (`NAV_ITEMS` + `resolveNavVisibility`/`visibleNavItems`/`visibleNavGroup` + `INLINE_NAV_MEDIA_QUERY` — one list feeding both the narrow disclosure and the 880px inline row, same `lib/` rationale as the admin tabs above). ⚠ **Presentation policy, NOT access control** — hiding a link protects no route; `pm-or-oversight` delegates to `canViewTracker`, while `cross-event` (admin ∨ organizer ∨ production director) is nav-local with no rules counterpart. Plan: `planning/archive/feature/PWA_MOBILE_NAV_PLAN.md` |
| Users directory (read) | `src/lib/users/users-service.ts`                         |
| Production form components (shared) | `src/components/production/` (SectionContentForm, contacts/links editors) |
| Advance tracker (read-model) | `src/lib/tracker/` (`tracker.ts` pure roll-up + `tracker-service.ts` reads) |
| Quote/estimate model | `src/lib/quotes/quote.ts` (type + Zod + totals/lifecycle helpers) |
| Quotes data access | `src/features/events/quotes-service.ts` (CRUD, status, signed copy, PDF) |
| Contact model | `src/lib/contacts/contact.ts` (type + Zod + tel/mailto helpers) |
| Contacts directory (read/write) | `src/lib/contacts/contacts-service.ts` (global `contacts/{id}`) |
| Event contact attachments | `src/features/events/event-contacts-service.ts` (per-event join). ⚠ Detach is **server-only** since 2026-08-20 — `detachContact` calls the `detachEventContact` callable, which refuses while crew-logistics records reference the attachment; the rules deny direct deletes. ⚠ Since 2026-09-03 each attachment carries a **denormalized `contact` snapshot** (name/role/company/phone/email) so members resolve their crew WITHOUT reading the global directory (`planning/ACCESS_SCOPING_PLAN.md` §4.2) — do not reintroduce a `listContacts()` join here; freshness is `functions/src/crewContacts.ts`'s job |
| Crew travel & lodging (model) | `src/lib/logistics/crewLogistics.ts` (discriminated `lodging`/`travel` union + Zod + parser; lodging dates are 'YYYY-MM-DD' day keys on the hotel's calendar, travel times are instants + IANA zones; `userId` is DENORMALIZED authorization data — see the plan §4.2 before touching it) |
| Crew travel & lodging (IO + UI) | `src/features/events/crew-logistics-service.ts` (query scope is chosen INSIDE `listCrewLogistics` from `canViewAllCrewLogistics` — never at a call site; see the list-query trap, plan §4.3) + `TravelLodgingPanel.tsx` on the event page |
| Crew-roster contact snapshots (backend) | `functions/src/crewContacts.ts` (`reconcileCrewContactsOnContactWrite` trigger + `reconcileCrewContactSnapshots`) — keeps each attachment's copied display fields aligned with the directory. Deliberately separate from the `userId` trigger below: display data, not authorization data. ⚠ Its `collectionGroup('contacts')` query also matches the GLOBAL directory (same collection id) — the depth guard is why a write never lands there. Backfill: `scripts/backfill-crew-contact-snapshots.ts` |
| Crew travel & lodging (backend lifecycle) | `functions/src/crewLogistics.ts` (`reconcileCrewLogisticsOnContactWrite` trigger + best-effort sync calls keep the denormalized `userId` aligned — null→uid/uid→null ONLY; `detachEventContact`; `relinkContactUser` admin-only bounded ATOMIC A→B relink, cap `RELINK_MAX_RECORDS`). Spec: `planning/archive/feature/CREW_TRAVEL_LODGING_PLAN.md` |
| Advance document inclusion | `src/lib/documents/advanceDocument.ts` (model) + `src/features/events/advance-documents-service.ts` (include/exclude IO) + `AdvanceDocumentsPanel` on the advance screen |
| Contact links (tap-to-call/email) | `src/components/contacts/ContactLinks.tsx` |
| iCalendar (.ics) builder | `src/lib/calendar/ics.ts` (pure VEVENT + download) |
| Google connection (client) | `src/lib/google/` (`google-service.ts` connect/disconnect + status, `useGoogleConnection.ts`, `bookings-service.ts`, `callBooking.ts`) |
| Google connection (backend) | `functions/src/google.ts` (per-user OAuth; connect/disconnect only), `functions/src/googleBookings.ts` (Appointment-Schedule booking sync + cron; `attachCallBooking` atomic manual attach, WS-G). The app never creates or cancels meetings — Google does, when an artist books a slot |
| Google API resilience (backend, WS-H) | `functions/src/lib/google/retry.ts` (`withGoogleRetry` — backoff on 429/5xx/network) |
| Data retention sweep (backend, WS-H) | `functions/src/retention.ts` (`scheduledDataRetention` daily cron + `runRetentionSweep` — prune abandoned OAuth states, expired rate limits, stale/dismissed bookings) |
| Timezone (Central, DST-aware) | `src/lib/dates/timezone.ts` (`APP_TIME_ZONE`, wall-clock ⇄ UTC, `formatCentralDateTime`/`Date`/`Time`, `centralDayKey`) |
| Schedule days (model + registries) | `src/lib/schedules/scheduleDay.ts` (day + embedded item + crew-line model, duration/sort/placeholder helpers) + `dayTypes.ts`/`itemTypes.ts` registries + `crewTypes.ts` (`config/crewTypes` model) — spec in `planning/archive/feature/SCHEDULE_REDESIGN.md` |
| Schedules data access (redesign) | `src/features/events/schedule-days-service.ts` (day CRUD, whole-day save, redate/shift; whole-day save is guarded by the `revision` optimistic-concurrency counter → `ScheduleDayConflictError` on lost update, WS-G; `EventScheduleScreen` at `/events/:id/schedule`). Old `schedule-service.ts` removed; calendar push callables return with the PR-4 rework |
| Schedule grid UI (shared) | `src/components/schedules/` (`ScheduleDayCard` day container + grid, `ScheduleItemRowEditor` inline editor, `CrewLines` view/edit, `ScheduleTypeDot` dot+legend, `SectionFieldInput`) |
| Crew types config IO | `src/lib/schedules/crew-types-service.ts` (`getCrewTypes`/`setCrewTypes`; admin screen `src/features/admin/CrewTypesAdmin.tsx`) |
| Event checklist (model + templates) | `src/lib/checklists/checklist.ts` (item + template models, fixed `main`/`post-show` sections, `completedAt` doubles as the done flag, stamp formatter) + `checklist-templates-service.ts` (admin CRUD, PMs read to import) |
| Event checklist IO (per-event, PM-only) | `src/features/events/event-checklist-service.ts` + `EventChecklistPanel.tsx` (dnd-kit drag reorder, editable completion stamp; rules deny non-PM reads); admin editor `src/features/admin/ChecklistTemplatesAdmin.tsx` |
| Schedule templates (redesign) | `src/lib/schedules/scheduleTemplate.ts` (day-first model, master composition `resolveTemplateDays`, editor bridges) + `src/lib/schedules/schedule-templates-service.ts` (CRUD, default-master); editor `src/features/scheduleTemplates/`; apply/import `src/features/events/` (`applyTemplateDaysToEvent`, `ImportScheduleTemplatePanel`) |
| Schedules → calendar | The per-event Google calendar push was RETIRED in Phase 3 (`planning/archive/feature/CALENDAR_SUBSCRIPTIONS.md`). Schedule days reach people through the per-user subscription feed instead; the per-item `pushToCalendar` flag now governs feed inclusion. Do not reintroduce a push |
| Lineup + placeholder resolution (backend, shared) | `functions/src/lib/schedules/` (`placeholders.ts` `resolveArtistPlaceholders`/`slotLabel` server mirror of the client resolvers; `lineup.ts` `loadEventLineup` — stages + advances loaded once per event, day-aware `{artist_N}` lookup). Used by the calendar subscription feed (the calendar push was retired in Phase 3) |
| iCalendar feed rendering (backend) | `functions/src/lib/ics/` (`serialize.ts` RFC 5545 escape/UTC-date format/UTF-8 75-octet fold/CRLF assembly; `digest.ts` digest VEVENT + VCALENDAR builders — pure, deterministic stamps). Wall-clock 'HH:mm' gate + 12-hour formatting: `functions/src/lib/dates/wallClock.ts`. Client single-event `.ics` download stays `src/lib/calendar/ics.ts` |
| Schedule day-type keys + labels (shared contract) | `functions/src/contracts/scheduleDayTypes.ts` (pure constants; client via `@contracts/scheduleDayTypes` — `src/lib/schedules/dayTypes.ts` adds the UI colors/def lookup) |
| Calendar subscription feed (backend) | `functions/src/calendarFeed.ts` (public per-user ICS `onRequest`: token→hash lookup, fail-closed user gate, layered rate limits) + `functions/src/calendarFeedTokens.ts` (`createCalendarFeed`/`rotateCalendarFeed`/`getCalendarFeedStatus` transactional callables, `revokeCalendarFeedForUser` used by setUserApproved/deleteUser). Spec: `planning/archive/feature/CALENDAR_SUBSCRIPTIONS.md` |
| Calendar subscription feed (client) | `src/lib/calendar/feed-service.ts` (credential callables) + `src/lib/calendar/subscription-service.ts` (per-user preferences + `toggleId`); Settings card `src/features/google/CalendarFeedCard.tsx` (https URL only — no webcal link, per the 2026-08-07 security review) + `CalendarFeedEventPicker.tsx` (include/exclude, digest↔items, hide-past) |
| Calendar feed preferences (backend) | `functions/src/calendarSubscriptions.ts` (`getCalendarSubscription`/`updateCalendarSubscription`; `readSubscription`/`normalizeSubscription` — a MISSING doc means all events + digest + keep history, so no backfill is ever needed) |
| Schedule item → calendar event (shared) | `functions/src/lib/schedules/itemEvent.ts` (`buildScheduleItemEvent`/`shouldHaveEvent` — one source for the Google push body and the feed's item-mode VEVENTs, so both render identical events) |
| Function public URLs (backend) | `functions/src/lib/http/functionUrl.ts` (`httpsFunctionUrl` — stable cloudfunctions.net alias / emulator branch; OAuth redirect + the feed's emulator URL). The feed's PUBLIC URL is `https://46advance.com/calendar-feed` via the Hosting rewrite in `firebase.json` (built in `calendarFeedTokens.ts`) |
| Google Drive (client) | `src/lib/google/drive-service.ts` (link/remove/savePacket callables + Picker), `driveFile.ts` (`DriveFileRef` type+Zod); Picker keys in `src/config/integrations.ts` |
| Google Drive (backend) | `functions/src/googleDrive.ts` (`linkDriveFile`/`removeDriveFile`/`savePacketToDrive`/`getDriveAccessToken`/`importDriveFolder`/`getArtistDocumentContent` broker + `scheduledLibraryDriveSync` twice-daily library sync; `drive.file` scope + docs-broker SA) |
| Drive broker bounded fetch + caps | `functions/src/lib/broker/brokerFetch.ts` (`fetchBrokeredFileBytes` size-bounded fetch; `MAX_EMBED_BYTES` packet-embed cap + `MAX_INTERACTIVE_CONTENT_BYTES` interactive-view cap) |
| Drive document-registration provenance | `functions/src/lib/broker/driveProvenance.ts` (`getFileForRegistration` + `resolveArtistFolder`; server-side folder-membership checks for the register* callables) |

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
