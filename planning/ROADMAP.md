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
  **authorized domains**; set OAuth **redirect URIs** (per-user Calendar/Meet/Drive — sign-in
  providers are excluded, §3) to it; use for the PWA manifest and mobile deep/universal links;
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
  from site CSS):** the site uses **Nexa** — but the org never actually held a Nexa license, so it
  was **removed 2026-08-01**. Current pairing: **Hikou** (Tugcu — licensed 2026-08-01) as the
  **display voice** — it is an ALL-CAPS face, so headings/accents only — and **Poppins** (OFL, the
  originally-planned Nexa substitute, revived) for **all body text**. Self-hosted woff/woff2 in
  `pwa/public/fonts/`. License constraints per face (PDF embedding, mobile bundling — Hikou is
  web-only; Poppins can go anywhere): `pwa/guides/FONT_LICENSES.md`.
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
  - **Fonts:** **Poppins** (OFL — body) **+ Hikou** (licensed — all-caps display), self-hosted in `pwa/public/fonts/`; the packet PDF stays Helvetica (license-gated). See Typography and `pwa/guides/FONT_LICENSES.md`. *(Nexa removed 2026-08-01 — never actually licensed.)*
  - Status colors stay distinct from brand red (neutral → amber → green; amber/green may harmonize with brand orange/lime).
  - **Themes (built):** light (default) **+ an opt-in dark theme** on these tokens — the dark chrome
    (`brand`) and red `accent` carry across both; only content surfaces/text/lines flip. A header
    toggle persists the choice; a one-time nudge offers dark when the OS prefers it.
  - *Notes:* the parent theme is Bootstrap defaults (ignore). The production-doc red reads more saturated
    than `#f04040` — report covers may use pure black + a punchier red slash; treat these **web tokens
    as the system source of truth**. Apply them in the Tailwind theme and update the `pwa/AGENTS.md` styling note (Phase 0).

## 3. Authentication

- **Only method:** email / password.
- **Google + Apple sign-in — excluded (decided 2026-07-31).** Previously listed here as optional
  secondary providers; neither was ever built and neither will be. Do **not** add them back without
  an explicit new decision. Note this is distinct from the **per-user Google OAuth** in §12, which
  authorizes Calendar/Meet/Drive access for an already-signed-in user and stays exactly as it is.
- **Password reset:** a forgot-password screen (`/forgot-password`) sends the Firebase reset email.

**Account approval (decided + built):** new accounts start **pending** — they authenticate but are
blocked from all app data by the UI `AuthGate` **and** by `firestore.rules` / `storage.rules` (the
`approved` custom claim) until an **admin approves** them (`setUserApproved`). Admins are
auto-approved; the claim is set by `syncUserClaims` (default pending).

**Mobile:** same single method — email/password. (Native Google/Apple sign-in is excluded along with
the web providers, so `mobile/` needs no `@react-native-google-signin` or Apple-auth dependency.)

## 4. Roles & Permissions (RBAC)

**Core model: roles are granted PER ADVANCE/EVENT, not globally.** A user is *not*
assigned one universal role — the same person can hold different roles on different
events (e.g. department lead on one, tech on another, production manager on a third).

Initial roles (extensible — more may be added later):

| Role | Scope (initial) |
| ---- | --------------- |
| **admin** | Top-level; likely a single person. Sets per-event assignments (who gets which role on which event). |
| **production manager** | Full read/write on events they're assigned to — same access as the event creator (who is simply auto-assigned this role). Also manages the event's member roster (Team & access panel), so a creator can designate a co-PM. |
| **department lead** | Read + **flag/comment** on assigned events. With **assigned departments** (`members.departments`, set in Team & access), can additionally edit + finalize/unlock those departments' sections on advances and stage production records; read-only elsewhere and read-only everywhere when none are assigned (the default). |
| **tech** | Read-only access to advance information. Attaching a crew contact that's linked to an app account auto-enrolls that account as tech (never downgrades an existing role). |

### Global capabilities (the exception to the per-event model)

The per-event model above is the rule. A small number of capabilities are **global** because
they answer questions no single event can — "may this person create an event?", "may this
person oversee work across all of them?" These are user-level claims, not event roles:

| Capability | Meaning | Status |
| ---------- | ------- | ------ |
| **admin** | Top-level; see above. | Built |
| **organizer** | May create events; may curate the artist document library. Set by an admin via `setUserOrganizer`, mirrored to `users/{uid}.organizer`. | Built (previously undocumented here) |
| **production director** | Oversight of **every event in the application**, whether or not assigned to it. Over event data it is **read-only** — no event writes, no admin functions. Plus one global write, added 2026-08-10: **curation of the global contacts directory** (edit/delete any entry, not only their own; relinking a contact to an account stays admin-only). Set by an admin via `setUserProductionDirector`, mirrored to `users/{uid}.productionDirector`. | Built (shipped + activated 2026-08-10; directory curation decided the same day) |
| **production coordinator** | The director's cross-event **read** reach, plus exactly **four writes** everywhere: crew travel & lodging, event crew rosters (Tech auto-enroll only — never role assignment), the global contacts directory, and event schedule days. Never widens `canEditEvent`. Set by an admin via `setUserProductionCoordinator`, mirrored to `users/{uid}.productionCoordinator`. Design: [`CREW_TRAVEL_LODGING_PLAN.md`](archive/feature/CREW_TRAVEL_LODGING_PLAN.md) Phase 2. | Built 2026-08-21; live on all targets 2026-08-24; first holder granted 2026-08-28 |

> **Decided (2026-08-09): the production-director exception.** A production director oversees
> the PMs' work and may or may not be assigned as a PM on any given event — so the capability
> **cannot** be derived from event membership, and the core "roles are per-event" model cannot
> express it. Granted instead as a global claim that widens the Firestore **read** rules across
> the event subtree; writes stay per-event. This is the first deliberate exception to the
> per-event rule, and is intentionally read-only so it can be widened later rather than
> narrowed. Full design, rules diff, and alternatives (auto-enrolment; server-side
> aggregation) in
> [`archive/feature/EVENT_OVERSIGHT_ROLE_PLAN.md`](archive/feature/EVENT_OVERSIGHT_ROLE_PLAN.md)
> (shipped and activated 2026-08-10).
>
> Note the naming discipline that came with it: capabilities get predicates named for the
> capability (`canOverseeAllEvents`, `canCreateEvents`), never for the claim — so the
> populations can diverge later without a call-site sweep.
>
> **The principle for when a capability goes global (recorded 2026-08-21, at the second
> exception):** a capability becomes a global claim only when it is *a function that cannot
> be derived from event membership because it spans shows by nature* — oversight of the PMs'
> work (director), booking travel across every show (coordinator). Anything expressible as
> "this person, on this event" stays a per-event role. Two exceptions now exist; a third
> should have to argue against this sentence, not just repeat the pattern.
>
> **Amended (2026-08-10): the first widening — and it is not an event write.** The
> read-only framing was chosen so the capability could be widened later rather than narrowed;
> that has now happened once. A production director **curates the global contacts directory**
> (§11) and may edit or delete **any** entry, not only the ones they created —
> `canManageContact` in `src/lib/rbac/permissions.ts`, mirrored by the
> `contacts/{contactId}` update/delete gates in `firestore.rules`. The rationale above is
> unchanged and still governs event data: the directory is company reference data, not event
> authority, and **every event write gate still ignores the claim**. The director also does
> **not** get the admin relink power — `createdBy`/`userId` stay immutable to them, so the
> F-3 ownership-seizure guard holds and linking a contact to an account remains an
> admin-only identity action. The same decision adds the director to the navigation's
> `cross-event` rule, so Contacts and Documents appear in their nav
> ([`PWA_MOBILE_NAV_PLAN.md`](archive/feature/PWA_MOBILE_NAV_PLAN.md)); that is presentation only —
> `contacts/{id}` and `artistDocuments/{id}` remain readable by every approved user, which
> is still open as [`IDEAS.md`](IDEAS.md) §5.

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
> departments config (full CRUD incl. **rename**). Model in `src/lib/rbac/`.
>
> **Built — Team & access (2026-08-03):** PM-facing roster management on the event screen —
> add-by-email via the `assignEventMember`/`removeEventMember` callables (PM-or-admin gate,
> approved accounts only, no self-changes so an event always keeps a PM), department-scoped
> editing for department leads (`members.departments` + the dept-scoped write branch in
> `firestore.rules`), and crew→tech auto-enroll from the Crew panel.

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

> **Built (2026-07-31): master house production advance.** An event template can be flagged
> the **default** — the master 46 house package. At most one carries the flag
> (`isDefault` on the template model; `setDefaultTemplate` clears the others in a batch,
> `getDefaultTemplate` reads it), mirroring the schedule-template default-master pattern.
> The new-event form **pre-selects** it instead of "Blank event", so a new event inherits
> the house package without anyone picking it; **Blank event** still starts from scratch.
> The create form also chooses **which sections carry over** — production record, stages
> (with their per-stage house packages), departments, default roles, event logo, schedule
> templates — all on by default, and the creator's own production-manager membership is
> written regardless. Events record the template they were created from. Creation **copies**
> values and never references the template, so edits to the master affect future events only.
> Model in `src/lib/templates/`; admin toggle in the template editor, **Default** badge in
> the templates list.
>
> **Built (2026-07-31): push to existing events.** The other half — a **Push to existing events**
> panel in the template editor retrofits shows that already exist, where before the template only
> ever applied at creation time. Scope is deliberately narrow: **production content only** — the
> event production record (info fields, production contacts, reference links) and the per-stage
> house packages, each a toggle, both on by default. **Roles and schedule templates are excluded
> on purpose:** roles would change who can see a live show, and schedule days would seed into
> schedules that already hold real content. Targets are ticked one at a time — **nothing
> pre-selected, no push-to-all**, 25 events max — with events created from this template grouped
> ahead of the rest. **Preview, then confirm:** a per-event field-level diff (from → to, plus the
> events that already match) must come back before Apply unlocks, and changing the sections or the
> target list clears the preview, so an apply can never run against a stale one. Writes **merge** —
> only keys the template actually carries are written, so an event-local field the template doesn't
> have survives — and stages are matched by **name** (a template's stage ids differ from those on
> events seeded from it); an unmatched template stage is reported as skipped, never created.
> Contacts and reference links are replaced as whole lists (ordered, no stable per-entry identity)
> and preview as a count change. Admin-only, rate-limited, not reversible. Client
> `src/lib/templates/template-push-service.ts` + `src/features/templates/PushToEventsPanel.tsx`;
> backend `functions/src/templatePush.ts` (`pushTemplateProduction` — one callable with a `dryRun`
> flag so preview and apply share a code path and can't drift).

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

Each event shows **up to 3 logos**, laid out by `src/components/branding/LogoRow.tsx` — the sole
owner of row order and sizing:

- The **show mark sits in the middle at 2× the mark height**, with the **shared default marks**
  split to either side (46 · show · Peachtree). Marks occupy equal fixed-width slots so a wide
  wordmark can't outweigh a compact one, and the gap is half the show-mark height.
- With **no** show mark the defaults render as a plain centered row of up to 3, all the same size —
  which is what an event with no festival and no override looks like.

The **show mark** is the event's per-event logo override, falling back to its **festival's** logo
(`resolveShowLogo`). A festival's mark therefore belongs on the **festival** (Admin → Festivals),
not in the shared defaults: a company default applies to *every* event regardless of festival, and
is dropped once a show mark exists (the row keeps at most two defaults alongside it).

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
  self), edit/delete by creator or admin** (and, since 2026-08-10, by a **production
  director** over any entry — see §4); **per-event attachment** `events/{id}/contacts/{attachId}`
  (join + role-on-event label, PM/admin write, member read) resolved against the directory.
  Tap-to-call/email shared component. Model in `src/lib/contacts/`.
  **User-account link — BUILT (correcting a stale "deferred" note, verified 2026-08-20):**
  every account links to exactly one contact on sign-in (`linkOrCreateContact` — an
  admin-pre-added contact matched by email, else a self-mirror at `contacts/{uid}`), tracked
  via `users/{uid}.contactId`, name kept in sync, unlinked on account deletion. Since
  2026-08-20 the link fields are **immutable to every direct client write including admin's**
  — `contact.userId` became denormalized authorization data for crew travel & lodging
  ([`CREW_TRAVEL_LODGING_PLAN.md`](archive/feature/CREW_TRAVEL_LODGING_PLAN.md) §4.2) — and admin relinking
  runs through the atomic `relinkContactUser` callable instead. **Crew logistics remains
  within production-director oversight** (plan decision 12): the director reads every
  itinerary, read-only, preserving §4's "director reads every event subtree" contract.

## 12. Integrations

- **Flex:** not needed (MPA integrates Flex — exclude).
- **Lasso:** company uses Lasso fully (all features, not just staffing), but **no
  integration now** — future goal, **low priority**.
- **Google Calendar — SHIPPED 2026-08-08 as a per-user subscription feed.** The
  "org-owned, one calendar per event/festival" design above was **superseded and removed**:
  the app had **no calendar-sharing code at all** (no `acl.insert` anywhere — sharing was done
  by hand in Google's web UI), and Google Calendar **cannot filter a shared calendar per
  recipient**, so "one calendar, each user picks their events" was only achievable with a
  generated per-user feed. Each person now subscribes once to
  `https://46advance.com/calendar-feed?token=…` and receives every event they're a member of,
  choosing per event between an all-day digest and individual timed items. The per-event
  calendars, the schedule push, and the app-created Meet path are **retired** — do not
  reintroduce a push. Full spec, cutover-gate evidence, and the remaining (conditional)
  hardening backlog: [`archive/feature/CALENDAR_SUBSCRIPTIONS.md`](archive/feature/CALENDAR_SUBSCRIPTIONS.md).
  Accepted trade-off: subscribed calendars are polled, and **Google's interval is commonly many
  hours** (~9h observed) — don't rely on it for show-day changes.
- **Google Meet — resolved: the app tracks meetings, it does not create them.** Advance calls
  are booked through a Google Appointment Schedule page; Google creates the meeting, mints the
  Meet link, and invites the artist. `syncAdvanceCallBookings` / `attachCallBooking` match
  bookings to advances and store the link. The app-created Meet fallback was retired in Phase 3,
  and the OAuth grant is now read-only on calendar events (`calendar.events.readonly`), so
  creating or cancelling meetings is not just unused but impossible.

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

## 12b. Artist & Event Documents (Drive library) — *built*

Beyond the Phase-13 per-advance Drive attach (§12), a full **document library** built on the
Drive integration: a standalone **Artists** list mirrors a Google Drive folder (per-artist
subfolders → classified `artistDocuments`), each artist's files can be **included on their
advance** (subcollection, per-event curation), **event documents** link to a per-event Drive
folder grouped by schedule day, and included PDFs/photos **embed into the generated packet**.
Reads flow through a dedicated docs-broker service account (RBAC-gated); a **twice-daily cron**
syncs the library from Drive and flags files missing from Drive (never auto-deletes).

- **Built (2026-07-11 → 07-18):** five PRs — categories, artist library + import, advance
  inclusion, event documents + uploads, packet embedding — plus `scheduledLibraryDriveSync`.
  Full spec + accepted-risk backlog:
  [`archive/feature/DOCUMENTS_FEATURE.md`](archive/feature/DOCUMENTS_FEATURE.md). Model in
  `src/lib/documents/`; backend in `functions/src/googleDrive.ts`.

## 13. Explicitly excluded / deferred

- Flex integration — **excluded**.
- Lasso integration — **deferred** (future, low priority).
- Freelance section — **excluded**.
- **Google / Apple sign-in — excluded** (2026-07-31). Email/password is the only sign-in method, on
  web and native. Per-user Google **OAuth** for Calendar/Meet/Drive (§12) is unaffected — that
  authorizes API access for a user who has already signed in.
- **Form-field `id`/`name` attributes — deferred indefinitely** (2026-08-08, from the production
  crawl). Every input/select/textarea (~155 across the PWA) lacks both attributes, so Chrome
  DevTools flags an autofill nit on most pages. Cosmetic: accessibility is unaffected (fields carry
  wrapping labels or `aria-label`), and sign-in already sets `autocomplete`, so password managers
  work. If ever picked up: `useId()` in the ~5 shared field components
  (`SectionFieldInput`, `ScheduleItemRowEditor`, auth `Field`, production editors) covers most of
  it; add real `autocomplete` values only on sign-in + ContactForm, `autoComplete="off"` elsewhere.

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
- Email/password auth flows — adapt. (Google/Apple sign-in **excluded** — see §3.)

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
- **Apple sign-in:** support on **web + iOS**. *(Superseded 2026-07-31 — Apple and Google sign-in
  are excluded; email/password only. See §3.)*
- **Google Drive (explore):** target **attach/link Drive files to advances**, **store generated packets in Drive**, **source template content from Drive**. (Sheets/Docs export not targeted.)
- **Schedules → Calendar:** **push schedule items** to the org-owned per-event calendar.

**Q&A round 5 — design (2026-06-21, after reviewing 46entertainment.com + 46 production packets):**

- **Brand palette:** **black / white / red** (red = signature accent, from the diagonal-slash band) + silver-grey; additional color via event photography.
- **Fonts:** **self-host the licensed Nexa** (primary) **+ Hikou** (display accent) directly across app + PDF. *(Updated 2026-06-25: the org owns the licenses; Poppins/Archivo dropped. Superseded 2026-08-01: the Nexa half was wrong — no Nexa license was ever held. Nexa removed; Hikou Desktop License purchased (all-caps display voice, web-only); Poppins revived for body. Terms: `pwa/guides/FONT_LICENSES.md`.)*
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
  event/festival or global? **Resolved — global**, and **built + deployed 2026-08-08** as a
  per-user ICS subscription feed rather than shared Google calendars (per-recipient filtering is
  impossible in Google's sharing model). See §12 Integrations and
  [`archive/feature/CALENDAR_SUBSCRIPTIONS.md`](archive/feature/CALENDAR_SUBSCRIPTIONS.md).
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
