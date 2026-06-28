# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This project is pre-release (`0.0.0`) and unreleased; entries are grouped by the day
they landed on `main`, newest first. Internal-only changes (CI, tests, tooling,
dependency bumps, and planning-doc updates) are omitted.

## 2026-06-28

### Added

- **Event & template logos:** templates and events now carry a show-specific logo, plus an admin-managed set of shared default marks (e.g. 46, Peachtree) that auto-apply to every event. Each logo holds two variants — one for dark backgrounds, one for light — so it renders correctly on the packet's dark cover, its white content pages, and the in-app event/advance headers (in both themes). Authored in the template editor and **Admin → Branding**, with a per-event override; the template's logo is cloned onto new events created from it.
- **Admin user management:** in **Admin → Users** you can now set a member's **display name** (shown in role pickers and member lists), **send a password-reset email**, and **delete an account**.
- **Contact auto-linking:** add a contact ahead of time, and when that person signs up with the same email their account links to the existing contact — inheriting its name — instead of creating a duplicate.
- **Readable event URLs:** events now live at a slug like `/events/rtc-ashland-26` (derived from the booking label or name + the 2-digit year, and editable at creation) instead of a random id. Old id links still work, and id-based links auto-upgrade to the slug.
- **Contact photos:** upload a profile picture — set your own in **Settings → Profile picture**, or any contact's from the contact form (e.g. external/non-account people) — shown as an avatar beside the name in the directory; a name-initials circle stands in when there's no photo.

### Changed

- **Event logo editing** moved into the event's **Edit** view — it previously sat on the main event page for anyone who could edit it.
- **Logo layout:** the event logo now renders **centered and larger**, flanked by the shared company marks (smaller) on each side — in the app event/advance headers and on the PDF packet (cover + title-block header).
- **Contacts directory:** a single-column list with **search** (by name, phone, email, or title) and **sort by first or last name**; the contact cards are more vertically compact.

### Fixed

- **Member names in pickers:** the template "Default roles" picker (and member lists) showed email addresses for accounts with no name on file. Names now appear once set — sign-in no longer wipes an admin-set name, and email/password accounts can be named in Admin → Users or by pre-linking a contact.

## 2026-06-27

### Added

- **Shared callable contracts:** backend-owned Zod schemas for every Cloud Function callable domain — auth/events/pdf, then google/drive/schedule — used by both the client and the server.
- **Error monitoring:** Sentry integration that activates when `VITE_SENTRY_DSN` is set (logger breadcrumbs + exception capture).
- **Dependency-audit governance:** a weekly, non-blocking `npm audit` workflow plus a tracked security-exceptions file, and an `.editorconfig`.
- **Events list:** text search that filters by event name and venue, composing with the existing status filter (filters the already-loaded list — no extra fetch).
- **Departments admin:** rename a department inline; previously the admin UI was create/delete only.
- **Password reset:** a forgot-password screen and public `/forgot-password` route, linked from the sign-in screen, that sends a reset email without revealing whether an account exists.
- **Template editor:** reorder stages with up/down controls; the new order persists through the existing template save.
- **Dark theme:** an opt-in dark theme that complements the light one, toggled from **Settings → Appearance**. Defaults to light, remembers your choice, and shows a one-time prompt to switch if your system prefers dark.

### Changed

- **Navigation cleanup:** simplified the header nav to **Events · Contacts · Admin · Settings** — removed the redundant "Home" link (the logo still returns to the start), moved the advance **Tracker** to a button on the Events list, relocated **Templates** into the Admin area, and dropped the dev theme-specimen link.
- **Header logo:** tightened the "46 Advance" lockup spacing to better match the 46 Entertainment mark.
- **Footer:** the Privacy Policy now stays pinned to the bottom of the viewport on short pages.
- **Member display:** member/role lists show people by name — "First L." inline, full name in the pickers — and render roles in plain form (e.g. "Production Manager" instead of "production-manager").
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
