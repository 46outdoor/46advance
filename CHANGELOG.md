# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This project is pre-release (`0.0.0`) and unreleased; entries are grouped by the day
they landed on `main`, newest first. Internal-only changes (CI, tests, tooling,
dependency bumps, and planning-doc updates) are omitted.

## 2026-07-22

### Added

- **Documents:** a search box at the top of the artist library narrows the list as you
  type. An optional "also search within file names" checkbox (off by default) widens the
  search to match document filenames too — handy for tracking down a misfiled item.
- **Admin → Document library:** the mirrored Google Drive folder is now set in the admin
  section. "Import from Drive" pulls files in but no longer silently repoints the whole
  library to whatever folder you happened to pick.

### Changed

- **Documents:** the artist list now alphabetizes ignoring a leading "The" — so "The
  Beatles" sorts under **B**.

### Fixed

- **Documents:** "Import from Drive" no longer fails on larger libraries. The import
  ran out of memory once the library grew past a few hundred documents, which the app
  mislabeled as a "Connect Google Drive in Settings first" error.
- **Assets:** replacing a logo or a profile/contact photo — or attaching a signed quote
  copy or a production attachment — no longer risks losing the previous file or leaving the
  new one orphaned when a save is cancelled or fails. The old file is kept until the new one
  is durably saved, and a failed save cleans up the upload it made.

## 2026-07-21

### Fixed

- **Events list:** production managers, department leads, and techs now see the events
  they've been added to. Their events-list query was being denied by security rules
  (only admins could list events), so a non-admin's list came back empty despite the
  "you'll see your events here once you're assigned a role" message. Members can now
  list their own event memberships — and only their own.

## 2026-07-18

### Fixed

- **Schedule templates:** saving edits to a template no longer fails with "Could not
  save" when optional fields (day titles, notes, item descriptions…) are blank.
- **Schedule grid:** the Start/End time fields are wider so the full time ("8:00 AM")
  and the picker icon are visible instead of being cut off (widened twice — the first
  pass was still a character short).
- **Template editor stages:** the Stage dropdown in the schedule-template editor now
  also lists stage names already used by the template's own items, so a stage-tagged
  item (e.g. "Main Stage") shows its stage instead of falling back to "Event-wide" —
  and editing such a row can no longer silently drop the stored stage name.
- **Template day labels:** day chips in the template editor now match the day's type —
  load-in days count up from the first one ("Load-in day 1" toward the show), show days
  read "Show day N", and load-out/travel days read their day position ("Day +2") instead
  of everything after the show being called a show day.

### Added

- **Lineup panel:** the event page now has a **Lineup** section — for each show day,
  every stage lists its numbered slots (Headliner, Direct Support, Artist N… — five on
  the main stage and four on side stages by default, with add/remove-slot controls to
  extend or trim from the end; an occupied last slot must lose its artist before it can
  be removed). Type an
  artist into an open slot to book it: the artist's advance is **created automatically**
  (an existing advance with that name on the stage is re-slotted instead of duplicated).
  Removing a booked artist checks for entered advance data first — a data-less shell is
  simply deleted after a confirm, while an advance with real work (started sections,
  content, notes, a scheduled call) asks whether to keep it off-lineup or delete it with
  its data. Slots holding two artists are flagged as conflicts.
- **Per-day lineups in schedules:** `{artist N}` placeholders — on the schedule grid and
  in calendar sync — now resolve against the item's **day** as well as its stage: an
  advance dated to that day wins the slot, an undated advance holds it event-wide. A
  two-day festival with different nightly headliners shows the right artist on each
  day's schedule.
- **Rock the Country show-day template:** seeded a "Rock the Country Show Schedule"
  schedule template — one show day of the two-stage RTC format: parking/doors, then per
  lineup slot a Truck Dump, a combined Set Stage / Soundcheck, and the show set (5 Main
  Stage slots + 4 Raised Rowdy slots), with the set-change/DJ-set gaps between sets and
  the midnight curfew as the day note. Items use `{artist N}` placeholders, so they
  render each event's booked lineup once slots are assigned.
- **"+1 day" schedule items:** post-show rows that spill past midnight (a 1:00 AM stage
  reset, a 12:30 AM production load out) can now stay grouped with their work day — check
  **"+1 day"** on the item and it sorts at the end of that day's card with a "+1" marker
  on the time, while calendar sync correctly places it on the following date. The
  festival production template uses this for its after-midnight rows.

- **Event documents:** each event now has a **Documents** page (linked from the event
  header). Link a Google Drive folder to the event in its edit form, then upload files
  straight into it from the app — each document tagged to a schedule day (grouped under
  the same color-coded day headers as the schedule, with an "Event-wide" group) and a
  category. Every member opens files in-app through the document viewer; PMs can re-day,
  recategorize, or remove records.
- **Artist library uploads:** upload new files to an artist straight from their document
  page — files land in that artist's Drive subfolder and appear in the library
  immediately. One-time step: re-run the library import once so each artist's Drive
  folder gets recorded (the import now tracks folders; it won't disturb your
  classifications).
- **Documents in the packet:** included artist documents can now be marked **"In
  packet"** on the advance — the generated packet PDF then carries them: a divider page
  per artist listing the attached documents, PDFs merged in at full quality, and photos
  as full pages. Files that are too large (over 10 MB), unsupported, or unreadable are
  listed on the divider with a note to open them in the app instead of being dropped
  silently. Library files marked **obsolete** no longer auto-populate the advance's
  document list — a "Show obsolete files" toggle reveals them when needed, and an
  obsolete file already included on an advance stays visible.
- **Automatic library sync:** the artist library now syncs from Drive twice a day
  (midnight and noon Central) — files added to artist folders directly in Drive show up
  in the app on their own, and files that were deleted or moved get a **"Missing from
  Drive"** badge instead of silently lingering. The Import button still works for an
  immediate refresh.

- **Documents on advances:** each advance now has a **Documents** section listing the
  artist-library files for that artist (matched by name), with checkboxes for the PM/admin
  to include specific files on the advance. Every event member sees the included set and
  can open the files **in-app** (via the document viewer — no Google Drive permissions
  needed). Files removed from the library stay visible on advances that included them.

## 2026-07-17

### Added

- **Schedule → Google Calendar sync (redesigned):** items marked **"Push to
  calendar"** auto-sync to the event's Google calendar again, on the new day model —
  saving a day reconciles all of its items (times derive from the day's date + each
  item's start/end in the event's timezone, overnight ends handled), `{artist 1}`
  placeholders resolve to the booked artist in the calendar event, and crew lines /
  type details appear in the event description. Re-dating or bulk-shifting days
  re-times every pushed item; deleting items or days removes their calendar events.
  As before, sync is a quiet no-op until you connect Google in Settings.

- **Master schedule templates:** a new template kind that composes other schedule
  templates in order (the first template defining a day owns its header; later ones add
  their items to it), with one master flaggable as the **default** — automatically
  applied when a new event is created without an event template that supplies its own
  schedule templates. Standard templates keep their categories.
- **Crew types (Admin):** the labor crew-type list (Stagehands, Riggers / Climbers,
  Fork / Lull Operators, …) offered on schedule crew lines is now editable under Admin.

### Changed

- **Schedule templates on the day grid:** the template editor now uses the same
  day-card grid as event schedules — color-coded day headers on the relative-day axis
  ("Load-in 2"), inline row editing, crew lines, the works. Template items carry the
  full redesigned shape (type, description, per-type fields, crew lines, push flag),
  and stages are picked by name from the event templates' stages.
- **Importing schedule templates** is back on the event schedule (edit mode): standard
  or master templates resolve against the event's start date and merge into existing
  day cards by date — an imported day landing on a date you already have adds its items
  to that card without touching your day's title or notes. Creating an event from an
  event template seeds the schedule the same way, in the new day format.

- **Schedule redesign (grid):** the event schedule is rebuilt around day-container
  cards (planning/archive/feature/SCHEDULE_REDESIGN.md). Each day is its own color-coded card — the
  day type (Travel / Load In / Show / Load Out / Off Day) drives the header color —
  with a title, description, and a small day-notes line, and its items render in a
  consistent grid: **Start | End | Duration | Type | Item | Description**, aligned
  across every card. The type shows as a color dot with a tooltip, and a color key
  under the schedule lists the types currently visible. Labor calls list per-crew
  lines ("(24) Stagehands · 10h") in an aligned mini-grid; the Duration column stays
  blank when crew lines run different lengths. `{artist 1}` placeholders in item text
  resolve to the artist booked in that lineup slot on the item's stage.
- **Schedule editing:** a global **Edit** toggle switches the grid to inline editing —
  edit cells directly in the row, with the type's extra fields (stage, travel/
  transportation details, crew lines) underneath; changes save when you leave the row.
  Days are fully manual: add, edit, re-date, or delete each day, and a **"shift all
  days ±N"** action moves the whole schedule when the event slips.
- **Schedule filters:** filter by day, type, or stage; filters live in the URL so a
  filtered view can be bookmarked or shared. The filter view replaces the old
  Edit/Master split and per-section day notes; "push to calendar" is now a per-item
  flag (calendar sync itself returns with the push rework).

### Removed

- **Old schedule screen:** the section-grouped list, the separate Master view with
  per-section toggles, the per-section day-notes blocks, and the schedule-item form
  (replaced by inline grid editing). Importing schedule templates returns with the
  template rework, on the new day model.

## 2026-07-10

### Added

- **Schedule template days:** templates are now built day-first, like the labor grids they mirror — add and label each operational day (e.g. "Load-in 3 — Stage Build Day 1 + Pre Rig"), then add items within it. The editor groups items under their day heading in aligned columns (times · quantity · title · duration/details), sorted by start time within the day — there's no manual reordering, so the display always matches the times. Days can be relabeled or moved (their items follow), and the item form no longer asks for a day.
- **Stagehand schedule details:** schedule items can mark their end time as **estimated** (a checkbox by the End field; shown as "(est)" in schedule lists), and labor calls now show their **total hours** (e.g. "10 hrs", overnight calls handled) in the event schedule and template editor. The schedule-template item form now also edits section-specific fields — e.g. a labor call's **Quantity** — matching the per-event schedule form. The call type (Stagehands, Riggers / Climbers, Fork / Lull Operators, …) is the item's title rather than a separate field.

### Changed

- **Schedule templates:** when adding an item in the template editor, the Section now defaults to the template's category (e.g. a Stagehand template starts new items on "Stagehand labor") instead of always starting on Production. "Other" templates keep the Production default.
- **12-hour times:** the schedule-template editor now displays times as 12-hour ("8:00 AM–6:00 PM") instead of 24-hour; event schedules already did.
- **Schedule templates:** the item form's Stage field is now a dropdown of the stage names defined across the event templates (plus "Event-wide"), replacing the free-text entry — so template items match event stages by a known name instead of relying on exact typing.
- **Event branding row:** the logo row (company marks flanking the centered event logo) now uses one consistent scale everywhere it appears — the event page, advance pages, and the packet PDF's cover and page headers. The event logo is larger, and the flanking marks sit in equal-width slots so both sides read symmetrically regardless of each logo's shape.

## 2026-07-01

### Added

- **Email verification:** new email/password accounts must now verify their email before getting access. A verification link is sent at sign-up, and a **"Verify your email"** screen (with resend + "I've verified — continue") stands in until it's confirmed. Google sign-ins are already verified, so they're unaffected.
- **Update prompt:** when a new version of the app has deployed, you now get a small **"A new version is available — Reload"** prompt instead of silently running old code. The app also self-heals if a page fails to load stale code after a deploy (it refreshes to the current version automatically).

### Fixed

- **Schedule days across timezones:** the schedule day picker and imported schedule-template items now derive each calendar day in the **event's timezone** rather than the viewer's browser zone, so opening a schedule from another timezone no longer lands items on the wrong day.
- **Overnight schedule items:** an item whose end time is earlier than its start (e.g. a load-out running 22:00 → 02:00) now correctly spans into the next day instead of showing a negative time range — in the form, in imported templates, and in event-template seeding.
- **Deep links to event pages:** opening or refreshing a schedule, production, stage, or advance page via an event's readable URL now loads correctly and keeps edit controls (previously these could show "not found" or drop your permissions depending on how you got there).
- **Tracker completion accuracy:** the advance tracker now counts every currently-enabled department for each advance, so a department added after an advance was created no longer makes completion read higher than the advance's own page shows.
- **Quote amounts:** quote line items reject invalid amounts (negative or non-numeric), and out-of-range stored values can no longer distort an artist-facing total.
- **Booking auto-attach:** syncing advance-call bookings now attaches each match transactionally. Two bookings for the same artist (or an overlapping manual + scheduled sync) can no longer overwrite each other's Meet link and time — the extra booking is queued for review instead.
- **Viewing Google-native docs in-app:** artist documents that are native Google files (Docs, Sheets, Slides — common for riders) now open in-app through the broker (exported to PDF) instead of failing to load; other file types are unchanged.
- **Duplicate calendar entries:** creating an event's Google calendar, or pushing a schedule item to it, is now idempotent — a double-click or an overlapping sync can no longer leave a duplicate/orphaned calendar or event.
- **Page-level error recovery:** if one screen hits an unexpected error, it now shows a contained "reload" message with the rest of the app still usable, instead of blanking the whole window.

### Security

- **Admin bootstrap hardened:** the global admin claim is granted only to a **verified** allowlisted email — previously an unverified address that matched the allowlist could receive it. Combined with the email-verification gate above, this closes an admin self-escalation path.
- **Approved-user gate on server callables:** the privileged Cloud Function callables (packet/quote PDF, event creation, Google Calendar/Drive/booking actions) now re-check that the caller's account is **approved**, matching what the Firestore rules already enforce — so a pending or admin-revoked member can no longer act through them.
- **Contact photo & link scoping:** a user can now only replace/remove contact photos they uploaded (previously any approved user could overwrite any photo), and a contact can no longer be created spoofing a link to someone else's account.

## 2026-06-28

### Added

- **Event & template logos:** templates and events now carry a show-specific logo, plus an admin-managed set of shared default marks (e.g. 46, Peachtree) that auto-apply to every event. Each logo holds two variants — one for dark backgrounds, one for light — so it renders correctly on the packet's dark cover, its white content pages, and the in-app event/advance headers (in both themes). Authored in the template editor and **Admin → Branding**, with a per-event override; the template's logo is cloned onto new events created from it.
- **Admin user management:** in **Admin → Users** you can now set a member's **display name** (shown in role pickers and member lists), **send a password-reset email**, and **delete an account**.
- **Contact auto-linking:** add a contact ahead of time, and when that person signs up with the same email their account links to the existing contact — inheriting its name — instead of creating a duplicate.
- **Readable event URLs:** events now live at a slug like `/events/rtc-ashland-26` (derived from the booking label or name + the 2-digit year, and editable at creation) instead of a random id. Old id links still work, and id-based links auto-upgrade to the slug.
- **Contact photos:** upload a profile picture — set your own in **Settings → Profile picture**, or any contact's from the contact form (e.g. external/non-account people) — shown as an avatar beside the name in the directory; a name-initials circle stands in when there's no photo. Pictures can be **cropped/reframed** (round) when uploaded and re-adjusted any time without re-uploading.
- **Document categories** (admin): an admin-managed list of document types — seeded with Tech Rider, Stage Plot, Input List, Media, Hospitality Rider, Contract, Other; add/rename/remove in **Admin**.
- **Artist documents:** a **Documents** library — **import an artist-docs Google Drive folder** (per-artist subfolders tag the artist, nested subfolders included), then browse per artist and **classify** each file by type. Files link to Drive (least-privilege metadata-only access; you pick the folder). Each document can also get an **in-app title** (without renaming it in Drive), **notes**, an **obsolete** flag, and a **verified/unverified** status (verification expires after 6 months, showing the last-verified date) — none of which touch the Drive file. Admins/organizers manage.

### Changed

- **Photo uploads downscaled:** contact and profile photos are resized client-side (longest side ≤ 1600px, re-encoded to JPEG) before upload — less storage and faster loads; the crop you set is unaffected.
- **Contacts directory performance:** the contacts list is now **virtualized** (only visible rows render) inside a scrollable panel, so large directories stay smooth to scroll and search; a **Load more** button appears past the first 1,000 to page through the rest (search/sort cover what's loaded).
- **Artist advance lineup:** the advance form drops the free-text **Stage** field (an advance already belongs to the stage it's created under) and the free date picker. The performance date is now a **dropdown of the event's days** (Friday, Saturday…), and each advance carries a **lineup slot** — Headliner, Direct Support, then Artist 3, 4… with an "add another" option (Headliner = Artist 1, Direct Support = Artist 2).
- **Schedule lineup slots:** in the schedule's **Show** items you now pick a **stage + lineup slot** (Headliner, Direct Support, Artist 3…) instead of pinning one specific act; the item **shows the artist** holding that slot on that stage (the slot designation moves to a hover tooltip), falling back to the slot name as a placeholder until a band is assigned.
- **Schedule templates:** reusable, categorized schedule blueprints (Production / Show / Stagehand / Other) authored in **Admin → Schedule templates**. Each holds timed items by festival day; from an event's schedule, **Import** a template to seed those items — times resolve to the event's dates (Central) and stage-tagged items match the event's stages by name.
- **Event "Crew":** an event's people list is now labeled **Crew** (the global directory stays "Contacts"), and each crew member can carry an **event-specific note** — kept on the event, not on the person's directory contact or any other event.
- **Load-in / load-out days:** an event's start/end are now explicitly its **show days**, and you can set optional **load-in** and **load-out** day counts. Those extend the schedule's day range (so you can schedule load-in/out) without touching the lineup, which stays on show days.
- **Schedule day picker:** adding a schedule item now picks a **day from a dropdown** of the event's actual days (`Mon 6/22 · Load-in` … through load-out) plus separate **start/end time** fields, instead of a combined date-time control. Falls back to a free date when the event has no dates set.
- **Stagehand labor item:** **Call type** is now a dropdown — Stagehands, Riggers, Fork Op, Spot Op, Cam Op, Other — alongside a **Quantity** field (replacing the free-text crew role + count).
- **Schedule-template days:** template items label their day **relative to the show** — `Load-in 1/2…` and `Show day 1/2…` from a dropdown, instead of an abstract "Day N"; they resolve to real dates when the template is imported onto an event.
- **Schedule day notes:** each day in the schedule can carry a **master note** plus a **note per section** (Production, Show, Stagehand…). The Edit view has a per-day "Day notes" editor; the Master view shows the master note and each section note labeled "<Section> Notes:".
- **Per-event timezone:** an event now has an editable **timezone** (default Central), set in the event form. The schedule **enters and displays times in the event's zone**, groups days by it, applies schedule templates in it, and the Google Calendar push uses it too — so an event in another city reads in its own local time.
- **Event templates apply schedule templates:** an event template can reference **schedule templates** (picked in the template editor) that are **auto-applied to the schedule** when you create an event from it — resolving each item's day/time against the new event's dates + timezone, and matching stage-tagged items by name. (You can still import schedule templates into any event manually.)
- **View artist documents in-app (Drive broker):** clicking a document's **title** now opens the file **in-app even without direct Google Drive access** — a dedicated service account (with read access to the docs folder) serves it through the app, gated by app access (approved users; the file must be a known artist document), with a spinner while it loads. A small **"Drive ↗"** link stays for the full Drive UI. Techs no longer need to be individually granted Drive access to see riders/plots.
- **Event logo editing** moved into the event's **Edit** view — it previously sat on the main event page for anyone who could edit it.
- **Event contacts** now show just the contact's **role on that event** (not their general job title/company).
- **Logo layout:** the event logo now renders **centered and larger**, flanked by the shared company marks (smaller) on each side — in the app event/advance headers and on the PDF packet (cover + title-block header).
- **Contacts directory:** a single-column list with **search** (by name, phone, email, or title) and **sort by first or last name**; the contact cards are more vertically compact, with **notes shown as a second column**.

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
