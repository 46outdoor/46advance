# 46 Advance — Phased Build Plan

Derived from [`ROADMAP.md`](ROADMAP.md) (the product/design spec). Sequenced by
dependency: **foundations → core advancing loop → visibility/output → people/external →
integrations**. PWA-first, mobile-aware throughout (shared backend + contracts so the
native app inherits logic).

**Status:** draft v1 (2026-06-21). Phases and the MVP line are adjustable.

## Principles

- **Dependency order** — don't build a feature before the data it reads/writes exists.
- **Per-event RBAC is foundational** — get the model + security rules right early; everything checks it.
- **Shared backend = mobile-ready** — business logic in Cloud Functions + Zod contracts so `pwa/` and `mobile/` consume one source of truth.
- **Adapt, don't reinvent** — each phase lists MPA code to port/adapt.
- **Vertical slices** — each phase ships something usable end-to-end (data → API → UI → tests), not a horizontal layer.
- **Status & auto-fill are cross-cutting** — shape section data to expose status and feed the tracker/packets from the start.

## MVP cut line

**MVP = Phases 0–5.** A production manager can sign in, get the right per-event access,
create a festival and its artist advances (seeded from a named template), fill
transportation + schedules, and generate a branded PDF packet. Tracker, quotes, contacts,
portal, and integrations are post-MVP fast-follows.

---

## Phase 0 — Foundation & scaffold
**Goal:** an empty-but-real app you can run, deploy, and theme.
- Provision Firebase project (`<!-- TBD id -->`); enable Auth/Firestore/Functions/Storage; emulators.
- Scaffold `pwa/`: Vite + React 19 + TS (strict) + Tailwind 4 + React Query + Zod + Vitest/Playwright; PWA config.
- **Design system:** brand tokens (black/white/**red**, slash motif), **dark chrome + light content**, status palette (neutral/amber/green); capture exact red hex + fonts from 46entertainment.com.
- **Infra canon** (canonical sources): `logger`, `errorCapture`/Sentry, `firestore/timestamps`, `config/*`, `lib/styles/variants`, `testing/*`.
- **CI/CD:** port `.github/` (lint/typecheck/test gate, staging/prod deploy, hosting external); branch protection on `main`; create `pwa/scripts/cli/` wrappers, then wire the deferred CLI hooks.
- **MPA adapt:** logger, errorCapture/Sentry, CLI wrappers, Vite/PWA config, testing mocks (governance already imported).
- **Mobile:** none yet — establish shared `contracts/` + document-level types so mobile inherits them.
- **Exit:** runs locally + on staging; 46-branded theme; CI green; `verify-safeguards.sh` + secrets-health pass.

## Phase 1 — Auth, users & per-event RBAC
**Goal:** the access model the whole app depends on.
- Auth: email/password (primary), Google + Apple (secondary; web + iOS).
- User records (admin-managed); single admin.
- **Per-event RBAC:** roles (admin, production manager, department lead, tech) granted **per advance/event**, not globally; resolve effective role per (user, event).
- Firestore security rules enforcing per-event roles (+ custom claims as needed).
- Departments: configurable, admin-managed list.
- **MPA adapt:** auth flows, memoized AuthContext, roles lib, claims setters, rules + rules-tests. **Redesign** MPA's *global* roles → *per-event* grants.
- **Mobile:** same claims/contracts; native sign-in providers — plan now.
- **Exit:** a user signs in; an admin grants them *different* roles on two events and rules enforce it (tested).

## Phase 2 — Events, advances & sections
**Goal:** core data model + CRUD.
- Event/festival → **many advances (one per artist/performance)**.
- Advance = sectioned record; **section status** (neutral → amber → green) with per-section **Finalize/lock** (unlock policy TBD).
- CRUD + list/filter, permission-gated by per-event role.
- **MPA adapt:** events/advances modules, event-form, list/filter, React Query patterns.
- **Mobile:** read advances/sections (entry PWA-first); shared callable contracts.
- **Exit:** create a festival, add artist advances, edit sections, status changes + finalize/lock work.

## Phase 3 — Templates
**Goal:** spin up events fast (most share the same package).
- **Named templates** seed **content (standard stage/production package) + default user/role list**.
- Create-from-template → auto-populate sections + seed per-event users/roles; manual overrides after.
- Template editor (admin/PM); edits apply to new events (effect on existing TBD).
- **MPA adapt:** form-builder / event-form / template patterns.
- **Mobile:** authoring PWA-first; mobile create-from-template + view.
- **Exit:** create an event from a template with content + default roles pre-filled.

## Phase 4 — Advance content: transportation + schedules
**Goal:** the artist-advancing substance.
- **Field taxonomy reference:** the audio lead's working advance ([`AUDIO_ADVANCE_REFERENCE.md`](AUDIO_ADVANCE_REFERENCE.md)) — concrete section groups (documents, staff, power, backline, risers, audio, etc.). Breadth (multi-department vs audio-first vs department-configurable) is pending (ROADMAP §15).
- Transportation/logistics (trucks, buses, vehicles, car services…) — fields per roadmap (**still being defined — iterate**).
- Schedules: production / show / travel / **stagehand labor** / custom; **master schedule** (whole-section toggles + per-item overrides).
- Section-status auto-fill hooks; data shaped to feed tracker + packets.
- **MPA adapt:** schedule + logistics/labor-coordination features.
- **Mobile:** field data entry + day-of schedule read — high value; design responsive.
- **Exit:** fill transportation + build schedules incl. master view; statuses reflect entry.

## Phase 5 — PDF advance packets (reports) — *MVP boundary*
**Goal:** the "absolutely need" output.
- **Server-side (Cloud Function)** generation; **full + per-department**.
- **46 report theme:** branded cover (dark photo + red diagonal slash + 46/event logos) + white title-block content pages (event/venue/dates, logos, section/page numbers).
- **Host** generated PDFs (Storage) behind **signed, expiring links**.
- **MPA adapt:** the report/PDF generation feature (locate in MPA — not a top-level module name).
- **Mobile:** server render shared; mobile view/share/download/print.
- **Exit:** generate a branded full + per-department packet from real advance data; shareable link works.

## Phase 6 — Advance tracker (grid)
- Read-only roll-up (events × advance sections), colored by section status (neutral/amber/green), auto-filled; condensed mobile view.
- **MPA adapt:** warboard / dashboard.
- **Exit:** tracker reflects live statuses; drill into an advance.

## Phase 7 — Quotes / estimates
- Simple line-item quotes for artist-covered expenses; **in-app PM approve/reject + status + audit**; PDF export (shared renderer); **signed-copy upload** to document storage.
- **MPA adapt:** document-upload; reuse Phase 5 PDF infra.
- **Exit:** create quote → PDF → PM approves → upload signed copy.

## Phase 8 — Contacts manager
- Reusable personnel directory (separate from RBAC users); attach per-event by role; mobile tap-to-call/email.
- **MPA adapt:** `Contact` type + user/admin management.
- **Exit:** maintain contacts; attach to an event; reach from mobile.

## Phase 9 — Artist portal (external)
- Token/link external access; inbound preliminary info + uploads; outbound hosted files (DOS, tech packs); inbound feeds the advance/tracker.
- **Security:** tightly scoped, expiring/revocable tokens; upload validation; portal perms separate from internal RBAC.
- **MPA adapt:** token-access display pattern (meeting-display / logistics).
- **Exit:** share a scoped link; external team submits info/files; data lands on the advance.

## Phase 10 — Integrations: Google Calendar + Meet
- **Per-user OAuth**; **org-owned, one calendar per event**; push schedule items; advance calls (create event + Meet link, or store link).
- **MPA adapt:** calendar sync feature; per-user OAuth token storage/refresh.
- **Mobile:** native OAuth (`expo-auth-session`); optional device-calendar UX.
- **Exit:** connect a user's Google; schedule items appear on the event calendar; create a Meet for an advance call.

## Phase 11 — Integrations: Google Drive
- Per-user OAuth; attach/link Drive files to advances; store generated packets in Drive; source template content from Drive.
- **Exit:** link a Drive file to an advance; save a packet to Drive.

## Later / backlog
- **Gear inventory & pull sheet** (new — from the audio advance reference): house-stock model library, per-advance quantities roll up to event totals + shortages. Own phase vs simplified vs defer — pending (ROADMAP §8b / §15).
- **Slack** — notifications-first, per-user creds.
- **Lasso** — staffing; tie into the stagehand labor schedule.
- **Native mobile build-out** (`mobile/`) — once PWA features stabilize, implement screens consuming the shared contracts; the per-phase **Mobile** notes pre-answer most decisions.

---

## Cross-cutting tracks (every phase)

- **Mobile-readiness:** logic in Functions + shared Zod contracts; document-level types; add each phase's **Mobile** plan.
- **Security:** update `firestore.rules` / `storage.rules` + rules tests with each data phase; rate-limit external calls.
- **Observability:** Sentry + `createLogger` from Phase 0; never `console.*`.
- **Testing:** unit + rules + smoke per phase; honor coverage thresholds.
- **Docs/memory:** update AGENTS.md canonical sources, CHANGELOG, ROADMAP "Decisions", and memory as structure solidifies.

## Immediate next actions (to start Phase 0)

1. **Firebase project** — `advancethat` (project # 518865772715), under `jared@yourstagemanager.com`. Configure the **46advance.com** custom domain + Auth authorized domains + OAuth redirect URIs (hosting/domain managed externally).
2. **Brand tokens — captured** (from site CSS): fonts **Nexa** + **Hikou**; dark `#273449`, red `#f04040`, neutrals `#f2f2f2`/`#b3b3b3`/`#262626`, accents `#ff853c`/`#8dff1c`. Fonts: use OFL substitutes **Poppins** (Nexa role) + **Archivo** (Hikou/display role) — self-host woff2; build the Tailwind theme.
3. **Decide CI specifics + code-review tool**; port MPA `.github/`.
4. **Scaffold `pwa/`** and create `pwa/scripts/cli/` wrappers; then wire the deferred CLI hooks.
