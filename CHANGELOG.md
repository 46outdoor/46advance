# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This project is pre-release (`0.0.0`) and unreleased; entries are grouped by the day
they landed on `main`, newest first. Internal-only changes (CI, tests, tooling,
dependency bumps, and planning-doc updates) are omitted.

## 2026-06-27

### Added

- **Shared callable contracts:** backend-owned Zod schemas for every Cloud Function callable domain — auth/events/pdf, then google/drive/schedule — used by both the client and the server.
- **Error monitoring:** Sentry integration that activates when `VITE_SENTRY_DSN` is set (logger breadcrumbs + exception capture).
- **Dependency-audit governance:** a weekly, non-blocking `npm audit` workflow plus a tracked security-exceptions file, and an `.editorconfig`.
- **Events list:** text search that filters by event name and venue, composing with the existing status filter (filters the already-loaded list — no extra fetch).
- **Departments admin:** rename a department inline; previously the admin UI was create/delete only.
- **Password reset:** a forgot-password screen and public `/forgot-password` route, linked from the sign-in screen, that sends a reset email without revealing whether an account exists.
- **Template editor:** reorder stages with up/down controls; the new order persists through the existing template save.
- **Dark theme:** an opt-in dark theme that complements the light one, toggled from the app header. Defaults to light, remembers your choice, and shows a one-time prompt to switch if your system prefers dark.

### Changed

- **Hosted PDFs:** quote PDFs now use signed, 7-day-expiring URLs; packets remain member-gated.
- **Concurrency-safe files:** advance Drive files and production attachments moved from arrays to subcollections so concurrent writes can't clobber each other.
- **Theme specimen:** the `/__theme` design-specimen route is now dev-only and no longer ships in production builds.
- **Routing:** route screens are now lazy-loaded (code splitting), shrinking the initial JS download (~957 KB → ~729 KB main chunk); a brief loading indicator shows on first visit to each screen.

## 2026-06-26

### Changed

- **Firestore rules:** added document-shape and status-enum validation across events, advances, quotes, and schedule items.
- **Deploy safety:** a real Functions secret-health check now runs before every functions deploy.
- **Admin bootstrap:** the Functions admin allowlist is configurable via `ADMIN_EMAILS` instead of being hardcoded.

## 2026-06-25

### Added

- **Google Drive (Phase 13):** link Drive files to advances and save generated packets to Drive.

### Changed

- **Approved-user access:** Firestore and Storage access is now gated on the approved-user claim in the backend rules, not just in the UI.
- **Rate limiting:** external-API callables are rate-limited via a distributed Firestore limiter.

## 2026-06-24

### Added

- **Stages & Departments (Phase 3):** admin-managed departments, with one configurable section per enabled department on each advance.
- **Audio advance content (Phase 4):** the audio department's structured field set.
- **Festival Production Record (Phase 5):** event-level and per-stage production details, with file attachments (stage plots, site maps) via Storage uploads.
- **Templates (Phase 6):** event/advance templates that seed stages, enabled departments, content, and default roles.
- **PDF packets (Phase 7):** generated advance packets and a summary report.
- **Advance Tracker (Phase 8):** a completion roll-up across advances × departments.
- **Quotes / Estimates (Phase 9):** quotes with line items, a lifecycle, and signed PDFs.
- **Contacts Manager (Phase 10):** a global contacts directory with tap-to-call/email links; user accounts are auto-added to it.
- **Advance call (Phase 11):** a shareable advance-call link with `.ics` calendar download.
- **Google Calendar & Meet (Phase 11):** per-user Google OAuth, automatic Meet links for advance calls, and Appointment-Schedule booking sync.
- **Schedules (Phase 12):** schedule items with a master schedule view, automatically pushed to the event's Google Calendar.
- **Account approval gate:** new accounts must be approved by an admin before they can access the app.
- **Public landing page, app icon, and privacy policy:** added for Google OAuth verification readiness.

### Changed

- **Artist Advances:** per-artist records are now labeled "Artist Advances."

### Fixed

- **Event loading for non-admins:** fixed via a `members.uid` index, alongside onboarding UX improvements.
- **Homepage reliability:** no-cache homepage with an immediate landing render, for dependable Google OAuth verification.

## 2026-06-23

### Added

- **Events, Advances & Sections (Phase 2):** events/festivals with per-artist advances and configurable sections.

## 2026-06-22

### Added

- **Auth, Users & RBAC (Phase 1):** sign-in, user accounts, and per-event role-based access control (admin, production manager, department lead, tech).

## 2026-06-21

### Added

- **Foundation (Phase 0):** initial PWA scaffold — React 19 + TypeScript (strict), Vite 7, Tailwind 4, Firebase wiring, and CI.
- **46 brand pass:** real logo, self-hosted Nexa/Hikou fonts, and a shrinking header; dev server pinned to port 4646.
