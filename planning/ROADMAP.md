# 46 Advance — Product Roadmap

**Status:** Active vision capture (started 2026-06-21). Living document — appended
as the user describes the product across planning sessions. This is the source of
truth for what to build and which **Miller Pro Advance (MPA)** elements to
import/adapt. Open questions are *parked* here (not asked) until the user invites
questions.

---

## Delivery approach & priorities

- **PWA is the primary build target; native mobile (`mobile/`) is secondary.**
- **Mobile-aware design from day one:** as each PWA feature is built or changed, plan how
  it maps to the native app — so that when native is planned, most decisions are already
  made. Favor shared, client-agnostic foundations:
  - Keep business logic in the shared backend (Cloud Functions) + shared **callable
    contracts** (`pwa/contracts/schemas/`) so both clients consume one source of truth.
  - Define data shapes at the document level (SDK-agnostic) per `AGENTS.md` § SDK differences.
  - Each feature entry below carries a **Mobile:** note capturing its native incorporation plan.
- Reuses the workspace's existing cross-app discipline (`AGENTS.md` § Cross-App Coordination),
  which already assumes a shared Firebase backend across `pwa/` and `mobile/`.

## 1. Purpose

- Track **advances** for **outdoor events** — primarily **large, multi-day festivals**.

## 2. Platform & Stack

- Backend: **Firebase** (user base is much smaller than MPA, so Firebase is comfortably sufficient).
- Apps: web (`pwa/`) and native (`mobile/`) per the workspace governance.
- **No separate freelance section** (MPA has one; exclude here).
- **Custom domain:** **46advance.com** (production web). Implications: add to Firebase Auth
  **authorized domains**; set OAuth **redirect URIs** (Google/Apple sign-in + per-user
  Calendar/Meet/Drive) to it; use for the PWA manifest and mobile deep/universal links;
  staging on a subdomain (e.g. `staging.46advance.com`). Hosting (incl. the domain) is
  **managed externally** — agents never deploy hosting.
- **Firebase project:** **`advancethat`** (display name "46 Advance", project # 518865772715),
  owned by the `jared@yourstagemanager.com` Google account. (Repo is under `46outdoor`; all the
  same user's accounts.)

## UI / Design language

- The app UI should be **complementary to `46entertainment.com`** — a cohesive brand feel, not a clone.
- Applies consistently across `pwa/` and `mobile/` (NativeWind shares Tailwind tokens).

### Design language (reviewed 2026-06-21 — logo + 46entertainment.com)

- **Palette — dark, high-contrast.** Brand dark is **near-black `#0a0a0a`** (the site is black/white) with
  white text; near-monochrome core. **Signature accent: red #f04040** (the slash band); plus sparing
  orange/lime and **full-bleed event photography** for color.
  → *Reconciliation:* keep a **dark base** (aligns with MPA's dark default) but **re-skin to 46
  branding** (true black/white, not generic zinc). "Adopt brand" = brand the dark theme, not switch to light.
- **Typography.** Bold sans-serif. Distinctive: **bold condensed numerals** ("46") and
  **letter-spaced uppercase** labels (per the logo); clean sans body for data. **Fonts (captured
  from site CSS):** primary **Nexa** (geometric sans — Black/Bold/Book; Nexa Black ≈ the logo
  numerals) + accent **Hikou**; fallback Helvetica/Arial/sans-serif. Self-host woff2 (as the site
  does) for `pwa/` + `mobile/`. Nexa/Hikou are the org's **licensed brand fonts** and are
  **self-hosted directly** across app + PDF **(decided 2026-06-25 — supersedes the earlier
  OFL-substitute plan; Poppins/Archivo dropped).**
- **Motifs.** **Diagonal slash** — small in the logo *and* scaled up as a bold **red diagonal
  page-divider** (thin silver edges) on document covers — a signature device. Plus a
  **right-facing arrow** (CTAs / forward momentum). The slash is the hero brand accent.
- **Aesthetic.** Modern, bold, energetic, production-focused, high-contrast, photography-forward —
  "where technical meets colorful."
- **Imagery.** Full-bleed, high-quality event photography (concerts, crowds, behind-the-scenes).
  Let imagery carry color against the black/white frame — best for login/landing/empty states.
- **Layout.** Full-bleed sections, generous whitespace, card-based groupings, clear hierarchy.
  *Caveat:* the app is **data-dense** — keep chrome minimal/dark and let content breathe; reserve
  marketing-style full-bleed photography for entry/empty screens, not dense advance views.
- **Voice.** Professional yet approachable, visionary. Taglines: *"Dreamers Thrive Here"*, *"all visions welcome."*
- **Document/report idiom (from 46's production packets — RTS / Rock the South).** Two modes:
  **(a) Cover** = full-bleed dark concert photography + a **bold red diagonal slash** + the white
  46 logo + event/partner logos. **(b) Content** = clean **white** pages with a professional
  **title-block header/footer** (event name, venue, dates, 46 + partner logos, section/sheet title +
  number) and functional color-coding. Our PDF reports should echo this (§7).
- **Functional vs brand colors.** The app needs **functional status colors** distinct from brand:
  tracker **neutral → amber → green** (§8) and validation states. **Red stays brand/primary** (not a
  status color). Define a small functional palette that coexists with the black/white/red brand.
- **Brand tokens (captured 2026-06-21 from 46entertainment.com theme CSS):**
  - **Dark/primary surface:** `#0a0a0a` (near-black — the site's black). White `#ffffff`. (Corrected from an earlier `#273449` misread — that hex was the most-frequent in the site CSS but was a component color, not the page background.)
  - **Neutrals:** light `#f2f2f2` / `#f7f7f7`; mid grey `#b3b3b3` / `#a2a2a2`; dark grey `#262626` / `#525763`.
  - **Accents:** **red `#f04040`** (signature) · orange `#ff853c` · lime `#8dff1c` (use sparingly).
  - **Fonts:** **Nexa** (primary) **+ Hikou** (display accent) — the org's licensed brand fonts, **self-hosted directly** across app + PDF (`pwa/public/fonts/`). See Typography. *(The earlier OFL-substitute plan — Poppins/Archivo — was dropped 2026-06-25.)*
  - Status colors stay distinct from brand red (neutral → amber → green; amber/green may harmonize with brand orange/lime).
  - **Themes (built):** light (default) **+ an opt-in dark theme** on these tokens — the dark chrome
    (`brand`) and red `accent` carry across both; only content surfaces/text/lines flip. A header
    toggle persists the choice; a one-time nudge offers dark when the OS prefers it.
  - *Notes:* the parent theme is Bootstrap defaults (ignore). The production-doc red reads more saturated
    than `#f04040` — report covers may use pure black + a punchier red slash; treat these **web tokens
    as the system source of truth**. Apply them in the Tailwind theme and update the `pwa/AGENTS.md` styling note (Phase 0).

## 3. Authentication

- **Primary:** email / password.
- **Secondary (optional):** Google, Apple.
- **Password reset:** a forgot-password screen (`/forgot-password`) sends the Firebase reset email.

**Account approval (decided + built):** new accounts start **pending** — they authenticate but are
blocked from all app data by the UI `AuthGate` **and** by `firestore.rules` / `storage.rules` (the
`approved` custom claim) until an **admin approves** them (`setUserApproved`). Admins are
auto-approved; the claim is set by `syncUserClaims` (default pending).

**Mobile:** same set — email/password, Google via native sign-in, Apple sign-in (native); see `mobile/AGENTS.md` auth patterns.

## 4. Roles & Permissions (RBAC)

**Core model: roles are granted PER ADVANCE/EVENT, not globally.** A user is *not*
assigned one universal role — the same person can hold different roles on different
events (e.g. department lead on one, tech on another, production manager on a third).

Initial roles (extensible — more may be added later):

| Role | Scope (initial) |
| ---- | --------------- |
| **admin** | Top-level; likely a single person. Sets per-event assignments (who gets which role on which event). |
| **production manager** | Full read/write on events they're assigned to (assignment set by admin). |
| **department lead** | Read + **flag/comment** on assigned events; cannot finalize/unlock sections or edit content (decided — mirrors the `canFlagEvent` gate). |
| **tech** | Read-only access to advance information. |

- **Departments (decided):** a configurable, admin-managed list (app-wide), used by department-lead roles, schedules, and packets.
- **Default role/permission template (decided):** creating an event auto-populates a default
  user+role list from the selected named template (§6); manual additions/changes are always
  available on top of the defaults.
- **Admin identity (decided + built):** the global `admin` claim is granted to emails in the
  `ADMIN_EMAILS` env var (default `jared@46entertainment.com`) — the *application* admin, distinct
  from the GCP project-owner Google account (`jared@yourstagemanager.com`, §2). Parsed by
  `functions/src/lib/auth/adminAllowlist.ts`.

> **Built — execution Phase 1:** per-event RBAC via Firebase custom claims — admin / production
> manager / department lead / tech granted **per advance/event**, with the effective role
> resolved per (user, event) and enforced in `firestore.rules` + rules tests; admin-managed
> departments config (full CRUD incl. **rename**). Model in `src/lib/rbac/`. (Department-lead
> scope resolved: read + flag — see the role table above.)

**Mobile:** enforce the *same* per-event roles via shared Firebase custom claims + callable contracts; the mobile app is primarily a consumer of these checks.

## 5. Advance Structure (content model)

Because the **stage and production package is standardized** (templated — see §6), the
advance work centers on **artist-specific details** that production managers collect per
event.

**Data model (decided):** an event/festival contains **many advances — one per artist/performance**; each advance is the per-artist record built below.

> **Built — execution Phases 2–4:** the advance + section data model (`src/lib/advances/`),
> **configurable per-department sections** (Phase 3) with the **section status state machine**
> (not-started → in-progress → finalize/lock — see below), and the first **audio** content
> field registry (Phase 4). **Stages are first-class** (`events/{id}/stages/{stageId}/advances`).
> Further department field sets are added iteratively. See `archive/feature/` (Phases 2–4).

> **▶ Current top priority (2026-06-25): build out the remaining departments' advance content
> and refine audio.** The per-artist advance registry `ADVANCE_FIELDS`
> (`src/lib/advances/fields.ts`) holds **audio only**; the other seeded departments —
> **lighting, video-led, staging, logistics, labor, artist-relations** — render empty advance
> forms and need field sets, and `AUDIO_FIELDS` needs refinement. (Per-stage *production* fields
> are further along: staging/audio/lighting/video-led done; logistics/labor/artist-relations
> still empty.) This ranks above all deferred items (portal, gear, Slack, Lasso — §8b/§10/§12).

> Building this list with the user — capture in progress; expect more categories below.

> **Queued (2026-07-18, after the field sets are built): previous-advance reference.**
> The same artists play multiple festivals. On an advance, below its content fields,
> show a small read-only note per field/section — "From previous advance: …" — pulling
> what was entered for the **same artist** (matched by name) on earlier events, labeled
> with the source event for reference. Read-only prefill hint, not a copy; implement
> once the remaining departments' field sets exist so the lookup covers real content.

### Section taxonomy (from the audio lead's working advance — reference)

The audio advance lead's live spreadsheet (see
[`AUDIO_ADVANCE_REFERENCE.md`](archive/reference/AUDIO_ADVANCE_REFERENCE.md)) is the concrete model for
**advance content (Phase 4)**. Its operating philosophy matches ours: **most
production is a standard festival package (templated, §6); the advance captures each
artist's additions, exceptions, and concerns.** Candidate section groups (breadth
pending — see Decisions):

- **Identity/header** — producer, show, **stage**, days, venue, address, website,
  maps, published date, blurb *(extends Event fields)*.
- **Schedule** — arrival · crossload · load-in · soundcheck · backline drop-off ·
  load-out · crossload return · set time *(maps to §5 schedules)*.
- **Documents** — production rider · stage plot · input list (received?) *(new)*.
- **Contacts** — PM / TM / Audio / additional (cell + email) *(§11, embedded per advance)*.
- **Staff** — FOH / monitor / playback / backline / LD / programming / VJ /
  content / additional crew / total personnel *(new)*.
- **Transportation** — semis · box truck · buses · vans · trailers · fest transpo ·
  personal *(extends §5)*.
- **Power** — audio / lighting / video / pyro / bus shore *(new)*.
- **Backline** — rented/carried/shared · list · notes *(new)*.
- **Risers** — typed counts *(new)*.
- **Audio** — consoles (FOH/MON) · snakes · patch · mics & DIs · stands & XLR (typed)
  · MON needs · RF · IEM · COM *(new — the audio dept content)*.
- **Lighting / Video / Rigging / Gas-Pyro** — present but mostly N/A on the audio
  sheet *(new; other departments)*.
- **Labor** — loaders / hands / heavy / riggers counts *(extends §5 stagehand labor)*.
- **Additions / Concerns / Pending** — structured per-advance, roll up to the summary
  report *(new vs our flags — see Decisions)*.
- **Financial** — direct pay / settlement *(new)*.

The sheet also has two **auto-filled report tabs**: a per-day **completion summary**
(→ §7 packet / §8 tracker) and a **gear pull-sheet/shortage** calculator (→ new
capability, below).

### Artist Transportation / Logistics

Basic info production managers collect (initial list — more coming):

- Production trucks
- Merch trucks
- Bus counts
- Bus trailers
- Personal vehicles
- Car services
- _(continued — list in progress)_

**Mobile:** PMs may enter/update these in the field — design for mobile data entry from the start.

### Schedules

> **Built — Phase 12 (2026-06-24):** structured schedule items (all six sections, specialized
> per-section fields, optional stage tag) + the **master schedule** (section toggles + per-item
> overrides), and **auto-push of master-schedule items to the event's Google calendar**. Times
> Central/UTC-safe. See `archive/feature/PHASE_12_PLAN.md`. Iterative — fields/layout will be refined.

Schedulable items (including transportation) feed a set of schedule sections, aggregated
into a master schedule.

- **Transportation schedule** — transportation items (trucks, buses, etc.) can carry scheduled times that flow upward.
- **Production schedule** — section.
- **Show schedule** — section.
- **Travel schedule** — section.
- **Stagehand labor schedule** — crew/labor scheduling (call times, crew counts; details TBD).
  May later tie to **Lasso** staffing (integration deferred — see §8).
- **Custom schedules** — ability to add additional schedule sections as needed.
- **Master schedule** (decided) — composite view that pulls from any of the above:
  **toggle whole sections, with per-item include/exclude overrides**.

**Mobile:** schedules are high-value on mobile (day-of reference) — prioritize clean read/scroll views; authoring can be PWA-first.

### Section status & finalize (decided)

Each advance section carries a status that drives the §8 tracker:

- **Not started (neutral/grey)** — no data entered.
- **In progress (amber)** — set automatically once data is entered in the section.
- **Complete (green)** — set by an explicit **Finalize** button per section, which **locks** that
  portion of the advance (editing after lock requires unlocking; **unlock = PM + admin**, same scope as edit — decided).

(Red is reserved for brand/primary, not status — see UI § Design language.)

## 5b. Festival / stage production record (general production — not per-artist)

In addition to per-artist advances, a festival needs a **general production record** for
the festival itself — the **house / standard package + site-wide info** that applies
across all artists (the design direction came from 46's production packets — RTS / Rock
the South; see § UI / §7). Distinct from a band advance; one (or a few) per event/stage.

- **Reuses the same machinery** as advances: department → section → content fields
  (Phase 4 registry), just attached to the **festival (event)** and/or **stage** instead
  of an artist. Likely content: house PA + FOH/MON console packages, site power / distro,
  festival-provided staff (house engineers), production schedule, site/venue/parking/
  credentials/load-in routes, hospitality/catering, safety/weather/curfew.
- **Feeds the standard package:** templates (§6) should seed this production record's
  defaults too; per-artist advances capture only exceptions to it.
- **Decided (2026-06-23):** **both levels** — event-level (general/policy/contacts) **and**
  per-stage technical (staging/audio/lighting/LED-video); a new **Staging** department;
  **file attachments** (stage plots/CAD/site maps via Storage) + external links. Built as
  **Phase 5** (before templates, which seed it). Field taxonomy from
  [`PRODUCTION_ADVANCE_REFERENCE.md`](archive/reference/PRODUCTION_ADVANCE_REFERENCE.md). Drives the §7 PDF.

## 6. Event / Advance Templates

Most events being advanced share the **exact same stage and production package**, so
the app needs **editable templates for creating new events**:

- Define/edit a template capturing the standard stage + production package (and likely
  the standard advance content/sections).
- Create a new event/advance **pre-filled from a template**, then adjust per event.
- Edit existing templates (changes apply to *new* events created from them; effect on
  already-created events **TBD**).
- **Multiple named templates** (decided) for the few event variants.

> **Built — execution Phase 6:** named templates that **seed content + the default user/role
> list** on create-from-template, plus a template editor (admin/PM; stages reorderable via
> up/down controls); edits apply to **new** events (effect on existing still TBD). Model in `src/lib/templates/`. See
> [`archive/feature/PHASE_6_PLAN.md`](archive/feature/PHASE_6_PLAN.md).

> Related to but distinct from the RBAC **default role/permission template** in §4.
> Both are "seed a new event from a reusable default" mechanisms — keep them coherent
> **Decided:** a template seeds content *and* the default user/role list together (see §4).

**Mobile:** template *authoring* is likely PWA/admin-first; mobile may be create-from-template + view only — TBD.

### Per-template logos (built)

Each event shows **up to 3 logos**: a show-specific **event logo** first, then the **shared default
marks** (typically 46 → Peachtree). The defaults are managed once (admin) and auto-apply; only the event
logo varies per show. The effective row is `[eventLogo, …defaultLogos]`, capped at 3.

- **Two variants per logo.** Every logo holds an `onDark` (white/light) and an `onLight` (dark/color)
  image, so it reads on any background; render code picks the variant for the surface and falls back to
  the other. Model + helpers: `src/lib/branding/logo.ts` (`Logo`, `effectiveLogos`, `logoForBackground`).
- **Authoring.** The **event logo** is authored in `TemplateEditorScreen` (per template) and overridable
  per event on `EventDetailScreen` (PM/admin). The **shared defaults** are managed in **Admin → Branding**
  (`BrandingAdmin`, persisted to `config/branding`). Uploads reuse `src/lib/storage/uploads.ts` via the
  shared `LogoUploader` (Storage paths `templates/<id>/logo`, `events/<id>/logo`, `branding/<i>`).
- **Report.** The packet renders the row server-side via `@react-pdf/renderer` `<Image>` in
  `functions/src/lib/pdf/packet.tsx` — **onDark** marks on the dark cover, **onLight** marks on the white
  title-block header. `generatePacket` resolves the effective logos, downloads each from Storage, and
  inlines them as base64 through `PacketData` (failures are skipped, never block generation).
- **Working advance.** `LogoRow` (theme-aware) shows the row in the `EventDetailScreen` /
  `AdvanceDetailScreen` headers.
- **Propagation.** `createEventFromTemplate` clones the template's `eventLogo` onto the new event.

Brand assets: `pwa/public/brand/46-mark-white.png`, `46-entertainment-white.png`. The **Peachtree** mark
is uploaded by an admin via **Admin → Branding** (no static asset shipped).

## 7. PDF Advance Packets (Reports)

**High priority — explicitly required ("absolutely need").** Port/adapt MPA's
**report** feature: generate **PDF Advance packets** from an event's advance data.

- Compile an event's advance information into a formatted, printable/shareable PDF packet.
- Likely section/department-aware (assemble the relevant advance sections into one document).
- **Host the generated PDF** (not just local print/download): store it (Firebase Storage) and
  provide a **shareable download link**. Consider access control (signed/token-scoped URL) and
  link expiry. (Same hosting applies to §9 quotes.)
- **Decided:** **server-side (Cloud Function)** generation; supports **both full + per-department** output.
- **Report theme (match 46's packet style):** branded **cover** (dark photo + red diagonal slash +
  46/event logos) and **content** pages (white, title-block header/footer with event/venue/dates +
  section/page numbers, black/white/**red** palette, slash accent). See UI § Design language.
- **TBD:** exact packet composition (which sections/fields) and final letterhead layout.
- **Logos:** the cover (onDark) + title-block-header (onLight) logos are rendered from the event's effective logo row — see §6 *Per-template logos (built)*.

- **Built — execution Phase 7:** server-side **`generatePacket(eventId)`** Cloud Function
  (@react-pdf/renderer) assembles the event production record + per-stage house packages +
  artist advances into a branded **cover + white title-block content** PDF, uploaded to
  `events/{id}/packets/**`. Renderer reused by §9 quotes (`generateQuotePdf`). **Link model
  (resolved):** **quotes** return a **signed, expiring (7-day v4) URL** for sharing with the
  artist (member-gated `getDownloadURL` fallback if the signing IAM isn't granted); **packets**
  intentionally use a **member-gated Firebase `getDownloadURL`** (internal — access controlled by
  `storage.rules`). **Remaining gap:** per-department / per-stage packet variants not built — the
  function takes `eventId` only. See [`archive/feature/PHASE_7_PLAN.md`](archive/feature/PHASE_7_PLAN.md).

> Adapt from MPA. The report/PDF code isn't a top-level `features/` module name — locate
> it in the MPA codebase during the import/adapt step (likely within the advance/report
> code plus a lib and/or a Cloud Function).

**Mobile:** prefer **server-side generation** (Cloud Function) so both clients share one renderer; mobile handles view/share/download/print of the packet.

## 8. Advance Tracker (grid / matrix)

A **grid/matrix-style tracker** for advances across events — at-a-glance status/progress.

- Axes TBD (e.g. events × advance sections / items / milestones).
- **Auto-fill:** cells populate automatically from data entered elsewhere in the app
  (transportation, schedules, etc.) — reduce manual re-entry; one source of truth.
- **Status model (decided):** read-only roll-up **colored by per-section status** — **neutral/grey =
  not started, amber = in progress** (data entered), **green = complete** (section finalized/locked,
  see §5). Red is reserved for brand, not status. Surfaces what's outstanding vs. complete at a glance.
- **Built — execution Phase 8 (2026-06-23):** **overview → drill-in** *(decided)*. `/tracker` lists
  visible events with a completion roll-up; `/tracker/:eventId` is an **advances (rows) × departments
  (columns)** status-colored grid; cells link to the advance. Read-only over existing section data —
  no new Firestore shape, functions, or rules. Read-model in `src/lib/tracker/`.

**Mobile:** dense grids are hard on small screens — plan a condensed/filtered (or read-only)
mobile view rather than a 1:1 port.

## 8b. Gear inventory & pull sheet (new — from the audio advance reference)

> **Priority: low (deferred 2026-06-25).** Not yet built; the own-phase/simplified/defer
> decision below stays parked until it's prioritized.

The audio advance's "DO NOT EDIT" tab maintains a **mic/DI/stand model library** with
**on-site stock**, auto-sums each artist's requested quantities, and surfaces
**shortages** (negative = short, flagged). This is a distinct capability from the §8
status tracker — an **inventory/pull-sheet** that rolls per-advance gear up to the
event level vs house stock.

- Maintain house stock per item (mic models, DIs, stands, XLR, cable, CAM tie-ins…).
- Advances contribute per-item quantities (the "Stands & XLR – REQUIRED" + mic/DI
  picks); the event aggregates **total in use** and **available/shortage**.
- Output: a **pull sheet** + shortage report (feeds purchasing/cross-rental).
- **Decision pending:** include as its own phase (full model library + auto-totals),
  a simplified version (free-text gear lists, no auto-shortage), or defer. See
  [`AUDIO_ADVANCE_REFERENCE.md`](archive/reference/AUDIO_ADVANCE_REFERENCE.md).
- **Mobile:** read pull sheet / shortages on site; entry PWA-first.

## 9. Quotes / Estimates (artist-covered expenses)

Create **very simple quotes/estimates** for **artist-covered expenses** and route them to a
**production manager for approval**.

- Lightweight line-item quote/estimate — keep it simple.
- **PDF export** of the quote (PDF export suffices — no e-signature integration needed).
- **Upload the signed version** back into the app for record keeping (document storage on the event/advance).
- Approval by a **production manager** — ties into per-event RBAC (§4).

**Mobile:** approve + view/upload from mobile is valuable (PMs on the go); authoring can be PWA-first.

- **Built — execution Phase 9 (2026-06-24):** quotes attach **per artist advance** *(decided)*
  at `…/advances/{id}/quotes/{quoteId}`: line items (desc/qty/unit) with computed total,
  lifecycle **draft→sent→approved/rejected** (PM/admin decide; decision audit by/at/note),
  **server-side PDF** (`generateQuotePdf`, reuses the functions PDF lib), and **signed-copy
  upload** to `events/{id}/quotes/**` (existing storage.rules). firestore.rules: quotes under
  the advance — member read, PM/admin write. Model in `src/lib/quotes/`.

## 10. Artist Portal (external shared-link access)

> **Priority: low (deferred 2026-06-25).** Not yet built; revisit after higher-priority work.

**Explore** a portal where a **shareable link** lets the **artist's production team** interact
without a full app account.

- **Inbound:** external team fills out **preliminary information** and **uploads documents**.
- **Outbound:** **host files for the artist's use** — e.g. DOS (Day-of-Show) schedules, tech
  packs, etc. — accessible via the shared link.
- **Token/link-based access** (no full RBAC account); scope each link to a single event/advance.
- Ideally, inbound submissions flow into the advance (and could feed the §8 tracker auto-fill).

**Security:** external surface — scope tokens tightly (one event/advance), support
expiry/revocation, validate uploads, and keep portal permissions separate from internal RBAC.

**Mobile:** the portal targets external users on their own devices — keep it responsive web;
the internal native app is separate.

## 11. Contacts Manager

A reusable **contacts/personnel directory** — many events share the same people, who often
**don't need app access** to the advances.

- **Contacts are distinct from app users/RBAC** — a contact is reference data (name, role,
  phone/email, company…), not necessarily an account holder with advance access. Some contacts
  may also be users (link/overlap TBD).
- **Reusable across events** — maintain people once; attach them to events as needed.
- **Per-event selection by role** — attach relevant contacts to an event so **techs can reach
  the right people** (who to contact for X), and as **event records** (who's who per event).

**Mobile:** contact lookup + tap-to-call/email is high-value day-of — prioritize mobile read access.

- **Built — execution Phase 10 (2026-06-24):** global directory `contacts/{id}` (name, role,
  company, phone, email, notes) — read by any signed-in user, **create by anyone (createdBy
  self), edit/delete by creator or admin**; **per-event attachment** `events/{id}/contacts/{attachId}`
  (join + role-on-event label, PM/admin write, member read) resolved against the directory.
  Tap-to-call/email shared component. **User-account link deferred.** Model in `src/lib/contacts/`.

## 12. Integrations

- **Flex:** not needed (MPA integrates Flex — exclude).
- **Lasso:** company uses Lasso fully (all features, not just staffing), but **no
  integration now** — future goal, **low priority**.
- **Google Calendar (planned):**
  - Read-only sync *from* existing calendars.
  - Write *to* **application-specific calendars** — **org-owned, one per event/festival** (decided; created as needed). **Schedule items push to these calendars** (decided).
- **Google Meet (desired):** most advance calls happen on Meet — explore generating/attaching
  Meet links for advance calls. Meet links are created via Google Calendar events with
  conferencing, so this **builds on the Calendar integration**. Per-user creds (see auth model).

- **Built — Phases 11 + 12 (2026-06-24):**
  - **11a** — the **"store an existing link"** path: an **Advance Call** (`advanceCallAt` +
    `advanceCallLink`) with a Join link and an offline **.ics** download (`src/lib/calendar/ics.ts`).
  - **11b** — per-user Google OAuth, an **org-owned per-event calendar**, **auto-create a Meet**
    for advance calls, and **auto-sync Appointment-Schedule bookings** to advances (cron + manual).
  - **12 (Schedules)** — the structured schedule model + master view, and **schedule items now
    push to the event calendar** (auto, master-schedule items). So **"schedule items push to
    calendars" is shipped** (previously deferred).
  - See `archive/feature/PHASE_11_PLAN.md` + `archive/feature/PHASE_12_PLAN.md`. Only open
    follow-up: OAuth-app **verification** to remove Google's "unverified app" warning.

- **Slack (explore):** company heavily uses Slack — explore integration (e.g. advance
  updates / notifications to channels, reminders, approvals). Scope TBD. Likely new (not in MPA).
  **Priority: low (deferred 2026-06-25).**
- **Google Drive (explore):** company heavily uses Drive. Targeted (decided): **attach/link
  Drive files to advances**, **store generated packets in Drive**, **source template content
  from Drive**. (Sheets/Docs export not targeted.)
- **Built — Phase 13 (2026-06-25):** **13a** attach/link Drive files to advances (Google Picker +
  least-privilege `drive.file`; server-validated, server-owned `driveFiles` **subcollection**) and **13b** save
  generated packets to Drive. **13c deferred indefinitely** — reframed to *template Drive links*:
  a template holds explicit Drive links that **carry over on create-from-template**, with **no**
  proactive attachment discovery / Docs-Sheets parsing. See `archive/feature/PHASE_13_PLAN.md`.

**Integration auth model:** all third-party access uses **each user's own credentials
(per-user OAuth)** — *not* a shared app/service account. The app acts on behalf of the
signed-in user. Implies secure **per-user OAuth token storage + refresh** and per-user
scopes/consent. Confirmed for **Slack + Google Drive**; likely Google Calendar too
(confirm). On mobile this uses native OAuth (e.g. `expo-auth-session`) rather than the
web redirect flow.

**Mobile:** calendar sync logic stays server-side/shared; native may also surface device-calendar UX (e.g. `expo-calendar`) distinct from the web Google API. Slack/Drive are API-driven and largely server-side, so both clients inherit them — mobile adds native share-sheet / deep-link affordances.

## 13. Explicitly excluded / deferred

- Flex integration — **excluded**.
- Lasso integration — **deferred** (future, low priority).
- Freelance section — **excluded**.

## 14. MPA import/adapt candidates (preliminary — to confirm later)

- RBAC/auth foundation — **adapt heavily** (MPA roles are global; here they are per-event).
- Advance/event data model — adapt.
- **Schedules** (production/show/travel/stagehand-labor + master/aggregate) — MPA `schedule` + `logistics`/labor-coordination — adapt.
- **PDF Advance packet / report generation** — MPA's report feature; **high priority** (locate in the MPA repo during import/adapt).
- **Advance tracker grid** — MPA `warboard` (big-board status) + `dashboard` — adapt.
- **Document upload / storage** (signed quotes, attachments) — MPA `document-upload` — adapt.
- **Token/link external access** (artist portal) — MPA token-access pattern (`meeting-display`, `logistics` display access) — adapt.
- **Contacts/personnel directory** — MPA has a `Contact` type + user/admin management — adapt (contacts ≠ access).
- Event/advance **templates** — MPA `form-builder` and `event-form` features are strong adapt candidates.
- Google Calendar sync (MPA has a calendar feature) — strong adapt candidate.
- **Google Drive** (Docs/Sheets/file storage) — MPA has Drive config (`config/integrations.ts`); adapt. (Slack would be new.)
- Email/password + Google auth flows — adapt; add Apple.

## Decisions (resolved)

**Q&A round 1 — 2026-06-21:**

- **Data model:** an **event/festival holds many advances — one per artist/performance** (1 event → N advances).
- **Departments:** a **configurable, admin-managed** list (app-wide); used by department-lead roles, schedules, and packets.
- **Templates:** **multiple named templates**; a template **seeds both content (stage/production package) and the default user/role list**.
- **Role seeding:** creating an event **auto-populates a default user+role list from the selected template**; admin/PM adjust per event afterward.

**Q&A round 2 — 2026-06-21:**

- **PDF generation:** **server-side (Cloud Function)** — one renderer shared by web + mobile; enables hosted links.
- **Packet scope:** support **both full and per-department** packets (selectable).
- **Master schedule:** **whole-section selection with per-item overrides** (both).
- **App-specific calendars:** **org-owned, one calendar per event/festival** (reading users' existing calendars still uses per-user OAuth).

**Q&A round 3 — 2026-06-21:**

- **Advance section status (drives the tracker):** hybrid, color-coded per section — **Not started (neutral)** → **In progress** (auto, once data is entered) → **Complete** (explicit **Finalize/lock** button per section). The tracker is a read-only roll-up colored by these statuses.
- **Advance calls:** **both** — create a Calendar event + Meet link from the app, *or* store an existing link.
- **Quote approval:** **in-app approve/reject with status + audit trail** (signed PDF uploaded for record).
- **Hosted links:** **quote PDFs** use **signed, expiring (7-day) links** (shared with artists); **event packets** use **member-gated download links** (internal).

**Q&A round 4 — 2026-06-21:**

- **UI theme:** **adopt the 46 Entertainment brand** (derive from the website; replaces MPA's dark/zinc default — concrete tokens in the design phase).
- **Apple sign-in:** support on **web + iOS**.
- **Google Drive (explore):** target **attach/link Drive files to advances**, **store generated packets in Drive**, **source template content from Drive**. (Sheets/Docs export not targeted.)
- **Schedules → Calendar:** **push schedule items** to the org-owned per-event calendar.

**Q&A round 5 — design (2026-06-21, after reviewing 46entertainment.com + 46 production packets):**

- **Brand palette:** **black / white / red** (red = signature accent, from the diagonal-slash band) + silver-grey; additional color via event photography.
- **Fonts:** **self-host the licensed Nexa** (primary) **+ Hikou** (display accent) directly across app + PDF. *(Updated 2026-06-25: the org owns the licenses; the earlier OFL-substitute plan — Poppins/Archivo — was dropped.)*
- **App base theme:** **dark, branded chrome (nav/header/sidebars) + light content areas** (readability for dense forms/tables).
- **Status colors:** **neutral/grey → amber → green** (not started → in progress → complete). **Red is reserved for brand/primary, not status** — supersedes round 3's "red = not started".
- **Photography:** dramatic event photography on **entry/landing, empty states, and PDF report covers**; work screens stay clean.
- **PDF reports:** match 46's packet idiom — branded cover (photo + red diagonal slash + logos) + white title-block content pages (§7).

**Q&A round 6 — resolved by implementation (2026-06-25):**

- **Advance content breadth:** **department-configurable** — sections follow the event's enabled
  departments (Phase 3), with the **audio** department built first (Phase 4).
- **Stage as a first-class layer:** **yes** — event → **stages** → advances
  (`events/{id}/stages/{stageId}/advances`, Phase 3); `stage` is not merely a field.
- **Additions / Concerns / Pending:** **structured per-advance fields** (carried on the advance
  and into the §7 packet), not the flags/comments mechanism.
- **What an advance contains (multi-day festival):** sections × per-department fields with
  status/finalize (Phases 2–4); field additions remain iterative.

**Q&A round 7 — resolved/shipped by implementation (2026-06-27):**

- **Account approval gate (§3):** new accounts start **pending**; blocked by the UI + Firestore/Storage
  rules until an **admin approves** (`setUserApproved`). Admins auto-approved.
- **Unlock scope (§5):** a finalized section is unlocked by **PM + admin** (same scope as edit).
- **Department-lead write scope (§4):** **read + flag** only — no finalize/unlock/edit.
- **Admin identity (§4):** the app admin is the `ADMIN_EMAILS` env allowlist (default
  `jared@46entertainment.com`), distinct from the GCP project owner.
- **UX polish:** events-list **text search** (name/venue), department **rename**, template **stage
  reorder**, and a **password-reset** screen.
- **Foundation remediation (complete + archived):** the P0–P2 guardrail/architecture review shipped —
  approved-access rules, shared callable contracts, secret-health gate, file-array → **subcollections**
  (`driveFiles` + production `attachments`), coverage gates, Sentry, rate limiting, route lazy-loading.
  See [`archive/fix/FOUNDATION_REVIEW_REMEDIATION.md`](archive/fix/FOUNDATION_REVIEW_REMEDIATION.md).

## 15. Open questions (parked)

**From the audio advance reference (2026-06-23):**
- **Gear inventory / pull-sheet / shortage engine:** own phase, simplified, or defer? *(open)*
- (Advance-content breadth, stage-as-first-class, and additions/concerns/pending are **resolved**
  — see Decisions § Q&A round 6. Granular per-section field inclusion confirmed during Phase 4.)

- Department lead: which specific write scopes? **Resolved** — read + flag only (see §4 + Decisions round 7).
- What does an "advance" contain for a multi-day festival (sections/fields)? **Resolved** —
  built in §5 (configurable per-department sections, Phases 2–4; see Decisions § Q&A round 6).
- Calendar: which dates/events flow to app-specific calendars; one calendar per
  event/festival or global?
- Templates: what exactly is in the standard "stage and production package" (the template content)?
- PDF packets: which sections compose a packet? Branding/letterhead requirements?
  (Scope + server-side generation decided.)
- Slack: notifications-only or deeper (approvals, two-way)? Or defer entirely? (Drive scope decided.)
- Per-user OAuth implications: integration actions/visibility follow each user's own
  access (e.g., a Drive file linked by one user may be inaccessible to another); how to
  handle token revocation and user removal. (App-specific calendar ownership decided: org-owned per event.)
- Schedules: how are multi-day festivals and time zones handled? Shared time/item model
  across schedule types? (Master-schedule selection model decided.)
- Tracker: what are the grid axes (events × advance sections / milestones / departments)?
  (Status model + read-only roll-up decided.)
- Quotes: which line-item fields for artist-covered expenses? Where do signed uploads live
  (per advance, file types, Storage rules)? (In-app approval with audit decided.)
- Artist portal: what "preliminary information" fields? One link per event or per artist?
  Link expiry/revocation, upload validation/limits, and where hosted files live (Storage + rules)?
  Does inbound portal data flow into the advance and feed the tracker?
- Hosted PDFs: regenerate-on-demand vs. store a fixed snapshot version? (Access decided: quotes = signed expiring links; packets = member-gated.)
- Contacts: which fields (name, role, phone, email, company)? Link a contact to a user account?
  Global directory vs. per-event entries? Which roles are selectable per event for tech reference?
