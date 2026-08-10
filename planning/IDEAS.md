# Ideas — future features, fixes & improvements

A capture space for things we want to do but haven't scoped yet. Ideas land here first,
get fleshed out in place, and graduate to a `PHASE_*_PLAN.md` (or a small PR) when we
decide to build them.

**How this differs from its neighbours:**

- [ROADMAP.md](ROADMAP.md) — the product spec: what's **decided** and what shipped.
  A decision recorded there is binding; this file holds candidates that haven't earned
  a decision yet.
- [BUILD_PLAN.md](BUILD_PLAN.md) — the original phased build order (historical).
- **This file** — not yet decided, not yet scheduled, deliberately rough.

Nothing here is a commitment. Entries may be deleted outright; that's a valid outcome.

Each entry carries a **Grounding** block — what was actually verified in the codebase at
the time of writing, so the idea can be picked up cold without re-deriving it. Grounding
goes stale; re-check before building.

---

## 1. PWA: collapse the narrow-screen top nav into a dropdown

**Status:** ✅ **DONE — built, released 2026-08-10 (`e0a5d542`), verified in production.** See the
archived [PWA_MOBILE_NAV_PLAN.md](archive/feature/PWA_MOBILE_NAV_PLAN.md); this entry is kept as
the origin record. Every open question below was answered by the build: **hamburger** trigger;
**nothing** stays inline; breakpoint **880px** — deliberately not a `sm:`-family value, because
the row was measured, and re-measured when the 44px targets widened it; **yes**, the menu fixed
the nav/route drift, which is why Tracker and both template screens are reachable at all now; and
**no**, it did not reach the signed-out screens — the duplicated brand lockup is still open.
**Raised:** 2026-08-08

### The problem

The top nav is too crowded on phones. Measured on production while signed in as an admin:

| Piece | Width |
| --- | --- |
| Brand lockup (mark + "ADVANCE") | 120px |
| Nav items + 16px column gaps (incl. email) | 598px |
| Header padding | 32px |
| **Total needed** | **750px** (573px below `sm:`, where the email is hidden) |
| Available on a typical phone | 360–430px |

> Corrected 2026-08-08: an earlier revision of this entry said ~678px. That measurement
> read the flex **row** gap (4px) instead of the **column** gap (16px). The real figure is
> 750px with the email shown — which also means the header wraps at *every* width below
> 750px, not just on phones.

The nav is `flex flex-wrap`, so it doesn't overflow — it **wraps onto a second line**.
That's the crowding: two rows of chrome eating vertical space on the smallest screens,
with tap targets well under the 44px the project's own rules require (`Sign out` is
`px-2 py-1 text-xs`; the Admin pill is `px-1.5 py-0.5 text-[0.6rem]`; the three text
links have no padding at all).

It's worse than it looks in a browser: the PWA manifest sets `display: 'standalone'`,
so once installed there is **no browser chrome** — this header is the only navigation,
and the wasted second row is permanent.

### Direction

**Decided:** mobile gets a **dropdown menu** behind a single trigger, rather than
exposing every link inline. Desktop keeps the current inline row.

**A useful observation while shaping it:** the two widest items aren't navigation at all.
The user's email (161px) and `Sign out` (65px) together are **226px — 43% of the nav's
width** — and neither is a destination. Moving identity + sign-out behind the same
dropdown (or a profile affordance) reclaims nearly half the row before a single link
is hidden. Worth deciding whether they belong in the same menu as the nav links or a
separate one.

### Open questions

- **What's the trigger?** Hamburger, or an avatar/initials button that doubles as the
  identity affordance? (Only one thing needs to be tappable either way.)
- **Does anything stay inline on mobile?** Everything behind the trigger is cleanest;
  keeping `Events` visible is a common compromise. Undecided.
- **Where does the breakpoint fall?** The codebase's responsive vocabulary is almost
  entirely `sm:` — matching it avoids inventing a new convention.
- **Does the dropdown fix the nav/route drift too?** `/tracker`, `/templates`, and
  `/schedule-templates` are real routes with **no nav entry at all** today. A menu with
  room in it is the natural place to surface them — but that's a scope decision, not a
  freebie.
- **Does the same treatment apply to the unauthenticated screens?** The brand lockup is
  currently duplicated in three places (`AppShell`, `LandingScreen`, `PrivacyScreen`),
  so a header change doesn't automatically reach the other two.

### Grounding

- **The header** is `src/components/AppShell.tsx:25-96` — the only app chrome, wrapping
  every authenticated route via `ProtectedLayout` (`src/App.tsx:205-217`).
- **Responsive handling today: essentially none.** Exactly one responsive utility exists
  in the whole header — `hidden … sm:inline` on the email span. The header *is*
  scroll-responsive (`useScrolled()` shrinks `py-5`→`py-2`, logo `h-12`→`h-8`) but never
  width-responsive.
- **Nav items are hardcoded inline** — no registry, no shared source of truth linking a
  route to a label, which is exactly how tracker/templates drifted out of the nav.
  `src/lib/admin/tabs.ts` (`ADMIN_TABS`) is the established precedent for what such a
  registry looks like and why it lives in `lib/` rather than a feature directory.
- **No dropdown/menu/drawer/popover primitive exists anywhere in the codebase.** The only
  overlay is `src/components/contacts/PhotoEditor.tsx` — a hand-rolled, well-tested focus
  trap (`:37-67`: focus on open, Tab cycle, Escape to close, restore focus to the opener)
  that is hardcoded to the crop UI. It's the reference implementation to copy from, not
  to import. `AdminTabBar` (`src/features/admin/AdminScreen.tsx:22-60`) is the most
  fully-realized nav control in the app (roving tabindex, arrow-key navigation) and is
  the a11y bar to match.
- **Touch-target idiom:** `min-h-11 … sm:min-h-0` is the dominant pattern (74 occurrences
  across 20 files); a smaller set uses unconditional `min-h-[44px]`.
- **⚠ This will break an existing test.**
  `tests/emulator/responsive-accessibility.emulator.spec.ts` runs at 390×844 and asserts
  that `Events`, `Contacts`, and `Documents` are *visible*. Putting them behind a
  dropdown makes them not-visible until the trigger is pressed, so the spec needs to open
  the menu first. (This spec is also why the crowding never showed up as a failure — it
  checks `scrollWidth <= clientWidth`, which wrapping satisfies.)

---

## 2. Group the events list by festival, with festival branding

**Status:** idea — design and layout open
**Raised:** 2026-08-08

### The problem

The events list is a flat, alphabetically-sorted grid of identical cards. It carries no
festival identity even though the festival is the primary way these events are organised
in the real world: **Rock the Country is one festival brand with many city stops**, and
the list gives no visual grouping, no branding, and no sense of which stops belong
together.

Two things make this more interesting than "add a header row":

1. **The festival name is already redundant in every card title.** Event names are
   composed as `{Festival} {Year} — {City, ST}` (`composeEventName`), so the production
   list currently reads *"Rock the Country 2026 — Ashland, KY"* on every RTC card. Under a
   festival group header, the cards only need the part that differs. Grouping should
   **remove** repetition, not add chrome.
2. **Alphabetical-by-name already clusters festivals incidentally** — which is why the
   flat list hasn't been painful yet. But it's accidental: it breaks the moment an event
   name is overridden, and it provides no separation or branding regardless.

### Direction

Group events under their festival, with the festival's mark and name as the group header,
and let the cards beneath shed the redundant prefix. Ordering, collapse behaviour, and how
grouping interacts with search/filter are all open.

### Open questions

- **Ordering.** Festivals have a canonical order (`sortFestivals` — `order` then name).
  Within a festival, events currently sort **alphabetically by name**, which for a touring
  festival means alphabetical by city. **Date order is almost certainly what a PM wants** —
  worth deciding, and it's arguably a fix independent of grouping.
- **Where does the branding go?** Festival mark on the group header only (clean, avoids
  repeating one logo N times), or also a small mark on each card? Header-only seems right
  but needs to be seen.
- **Legacy / unfiled events.** `festivalId` is nullable for events created before
  festivals existed, so an "Other"/"Ungrouped" bucket is required. What does it look like,
  and does it sort first or last?
- **Grouping vs. filtering.** When a search is active, does the list flatten to results,
  or keep groups and hide empty ones?
- **Collapse/expand per festival?** Useful once there are many stops; premature at two
  events. Persist the state if we do it.
- **Does the festival become a filter too?** A festival chip row alongside the existing
  All/Draft/Active/Archived filter is an obvious adjacent idea.

### Grounding

- **The data is already in hand.** `festivalId` is a first-class field on every event
  (`src/lib/events/event.ts:38`), so grouping needs **zero additional fetches**. It is
  nullable only for legacy events — `EventForm` hard-gates creation on choosing a festival
  (`:381-384`), so anything created since is filed.
- **Festival names/logos need one extra query.** `listFestivals()` keyed on
  `festivalsKey()`; the exact `useQuery` line already exists in three sibling screens
  (`EventDetailScreen:178`, `EventForm:336`, `AdvanceDetailScreen:89`) to copy. Firestore
  rules let any approved user read `festivals`, so there's no permission blocker.
- **The branding chain is already decided and built** — see ROADMAP §6 "Per-template
  logos". `resolveShowLogo(eventLogo, festivalId, festivals)` resolves per-event override →
  festival logo. Every logo is dual-variant (`onDark`/`onLight`, named for the *background*
  they sit on, not the ink colour), and `logoForBackground` picks the right one with a
  fallback to the other. `LogoRow` is theme-aware and already renders this row on the event
  detail and advance detail headers, and on the PDF packet cover. **The events list is
  simply the one surface the existing branding never reached** — this is a display gap,
  not a new system.
- **The festival model is thin:** `{id, name, logo, order}` and nothing else. No slug, no
  brand colours, no cover image, no abbreviation, no archived flag. If the design wants a
  festival colour or a banner image, that's a model change to call out explicitly.
- **Complexity budget is fine.** `EventsListScreen` is at cyclomatic complexity **20**
  against a hard gate of 25 — note `AGENTS.md` and `.claude/rules/code-organization.md:61`
  both still say 23, which is stale. Inlining a `reduce` + nullable-festival ternary +
  group-header conditional into the render would plausibly land at 24–26, i.e. straddling
  the gate. The established escape hatch is right there: `filter-events.ts` is a pure,
  separately-unit-tested module extracted from this very screen for exactly this reason,
  and a `group-events.ts` should mirror it.
- **⚠ This will break an existing test.** The seeded E2E events are literally named
  *"Alpha Festival"* and *"Beta Festival"*, and
  `tests/emulator/auth-isolation.emulator.spec.ts` asserts
  `getByRole('heading', { name: 'Beta Festival' })` **has count 0** for a user who
  shouldn't see it. If group headers render as headings carrying festival names, that
  negative assertion breaks. Card titles must stay heading-addressable, and group headers
  need a distinguishable accessible name or a non-heading role.
- **Test coverage is thin here.** There is no `EventsListScreen.test.tsx`; the only
  colocated test is an a11y/create-flow test that mocks a **single** event with
  `festivalId: null`. The `makeEvent` factory in `filter-events.test.tsx` (which already
  includes `festivalId`) is the natural fixture for grouping tests.

---

## 3. Crew travel & lodging (hotels, bunks, flights, rental cars)

**Status:** idea — shape open
**Raised:** 2026-08-08
**Related:** shares a root with §4 — both need to know *who is on site, and when*.

### The problem

PMs need to track **lodging for assigned crew** — hotels or bunks — and that naturally
groups with the rest of a person's travel: flights, rental cars, and the miscellaneous
logistics that surround them.

Today the app can describe *a group movement on a timeline* but not *a person's
itinerary*. Those are different shapes, and the gap between them is the whole idea.

### What's actually missing (and what isn't)

**Flights and rental cars already exist — as schedule rows.** The schedule has a `travel`
item type carrying Mode (Flight/Drive/Train/Other), Carrier, Flight/Conf #, From, and To,
and a `transportation` type carrying Vehicle, Driver, Pickup, and Drop-off. But the "who"
on those rows is a **free-text `party` field** — "Production team", "Stagehands" — with no
link to a crew member. So the system can say *"Production team travels in, Wednesday"*.
It cannot say *"Joe King, AA1234, DFW→CVG, conf ABC123, lands 4:15pm."*

**Lodging has zero prior art.** No hotel, room, rooming, bunk, accommodation, or per-diem
concept exists anywhere — not in the schema, the rules, the planning docs, or the
changelog. The only trace is an unanswered question in an archived plan.

**The crew roster is thin.** An attached crew member stores exactly `{contactId,
roleLabel, notes}` — a role and a freeform note, nothing more. The contact record behind
it has no address, emergency contact, dietary, or sizing fields either.

### The shape question (the crux)

The app has two established shapes for information, and travel/lodging fits neither:

1. **Fields on a record** (production info, advance content) — flat scalars only, one
   value per key. A rooming list can't live here; only a prose blob like "Crew lodging".
2. **Time-anchored schedule rows** — good for "the bus leaves at 6", wrong for "Joe is at
   the Hampton Inn Thu–Sun in room 412".

Per-person travel and lodging is a **third shape**: a record attached to a *person*,
spanning *dates*, that may or may not surface on a timeline. Deciding that shape is the
real design work here — not the field list.

A likely sub-shape worth thinking about: lodging is usually booked as a **resource with
slots** (a room block at one hotel; bunks on one bus) and then **people are assigned to
slots**. That's two linked things, not one flat list — and it's the same pattern whether
the resource is a hotel or a bus.

### Open questions

- **Named crew only, or blocks too?** The roster holds ~24 named people, but a festival
  also calls anonymous labor by headcount (28 stagehands). Do we lodge only named people,
  or also reserve unnamed blocks that get names later?
- **Whose crew?** Crew spans five companies (46 Entertainment plus Stageline, Backstage,
  Deep South, Stage for Rent). Does 46 track lodging for vendor crews, or only its own?
- **Do travel records replace or complement the schedule rows?** If Joe's flight becomes a
  person record, should it still appear on the travel-day schedule, and who owns the
  duplicate? Deriving one from the other is possible in either direction.
- **⚠ Privacy — this needs an explicit decision.** Every event member, **including
  read-only Techs, can already read the entire crew roster, the whole global contacts
  directory, and the full production record.** Attaching a crew member automatically
  grants them Tech access. So anything stored on those records — confirmation numbers,
  room assignments, personal travel — is visible to *everyone on the show* by default, and
  the rules offer no field-level gating (they can't scope keys inside a map). If crew
  should see only their own itinerary, that's a **new access pattern**, not a tweak.
- **Does it reach the packet?** Rooming lists and travel manifests are classic packet
  content, but the packet **never reads the crew roster today** — it's event → stage →
  advance only. This would be a new top-level section, not a field addition.
- **Does it reach personal calendars?** "Flight departs 6am", "checkout 11am" would be
  genuinely useful in the per-user feed — but the feed is **event-scoped, not
  person-scoped**. `pushToCalendar` is global to everyone subscribed to that event. Making
  one person's lodging appear only on *their* calendar is a new addressing dimension.
- **Where does it live in the UI?** Its own panel on the event, an extension of the Crew
  panel, or a "Logistics" area that also finally fills the empty Logistics department?

### Grounding

- **Crew attachment:** `events/{eventId}/contacts/{attachId}` = `{contactId, roleLabel,
  notes, addedBy, addedAt}` (`src/features/events/event-contacts-service.ts:68-92`); UI is
  `EventContactsPanel.tsx`. Attaching auto-enrolls the contact's app account as a Tech
  (`:150-162`).
- **Contact model** (`src/lib/contacts/contact.ts:31-46`): name, role, company, phone,
  email, notes, photo, userId + audit fields. Nothing travel- or lodging-adjacent.
- **Travel/transportation item types:** `src/lib/schedules/itemTypes.ts:58-82`. Note the
  schedule item `fields` map is typed `Record<string, string>` — **strings only**, no
  numbers or nesting (`scheduleDay.ts:57`), and the editor prunes any key the type doesn't
  declare.
- **Production record `info`** holds flat scalars (`string|number|boolean|null`) in
  `events/{id}/production/record`; a per-person table cannot live there.
- **Lodging sweep:** a repo-wide search for lodging/hotel/rooming/bunk/accommodation/
  per-diem/rental-car returned exactly one real hit — an unanswered open question in
  `planning/archive/feature/PHASE_12_PLAN.md:94` ("crew counts, travel flight #/hotel)?
  Start generic, specialize later?"), resolved at the time in the generic direction.
- **The Logistics department is an empty shell.** `logistics` exists as a seeded
  department (order 4) but has **zero fields** in both registries, so its advance section
  renders an empty form. ROADMAP §5's "Artist Transportation / Logistics" list (trucks,
  buses, car services — no lodging) was never turned into code, and ROADMAP already flags
  filling the empty department field sets as a current priority. Worth deciding whether
  crew logistics and that artist-side list are one effort or two — they're different
  subjects (crew vs artist) that would land in the same named place.
- **Duplicate people surface:** `EventProduction.contacts[]` is a second, hand-typed
  `{role,name,phone,email}` array that does **not** reference the contacts directory or
  the crew roster. Any "people on this event" work should reconcile the two rather than
  add a third.

---

## 4. Catering headcounts & credential counts

**Status:** idea — shape open
**Raised:** 2026-08-08
**Related:** §3 — both are views over the same "who's on site, when" question.

### The problem

PMs need **headcounts for catering** and **counts for credentials** (wristbands, passes,
and the rest). Today both exist only as prose: `crew_catering` and `crew_credentials` are
free-text fields on the event production record. You can write "lunch for the crew" but
you cannot answer "how many for lunch on Friday" or "how many wristbands do I print".

### The interesting part

**Much of the raw data is already in the system, just not summed.** Labor schedule items
carry structured crew lines — `{type, quantity, hours}` — so a real show day already
records things like *(28) Stagehands · (4) Riggers/Climbers · (2) Fork-Lull Operators*
from 5am, a different *(12) Stagehands* call from 1pm, *(2) Cam Op*, *(4) Spot Op* from
7pm, and so on. The catering rows (Breakfast/Lunch/Dinner) sit on the same day with their
own time windows.

So "how many people are on the clock during the lunch window" is **computable from data
that already exists** — it's a question of summing overlapping calls, not of collecting
new information. A derived count also stays correct when the schedule changes, which a
hand-typed number never does.

That suggests two very different versions of this idea:

- **The cheap version:** add numeric fields to the production record. The field registry
  already supports `type: 'number'` and already uses it (`system_techs`, `audio_techs`),
  and adding a field is a one-line append that every consumer picks up for free. This
  gets you a number on a page today. It won't break down by day or meal, and it goes
  stale the moment the schedule moves.
- **The real version:** derive counts from who's actually called, per day and per meal,
  with manual adjustments layered on top. Much more useful, and it depends on the same
  roster/attendance question §3 raises.

### Open questions

- **Which population counts?** Named crew (~24 contacts), anonymous labor headcounts (the
  28 stagehands), artists and their parties, vendors, guests — catering and credentials
  almost certainly draw different lines, and artist parties aren't modelled at all today.
- **What granularity?** One number per event, per day, or per meal? Per credential *type*
  (crew laminate vs. day wristband vs. vendor pass vs. guest)? Credential types are
  probably an admin-managed list, the way crew types already are.
- **Derived, entered, or both?** A derived count with a manual override is the honest
  answer for most production paperwork, but it's meaningfully more work than a number
  field.
- **Where does it live?** The production record is the natural home by precedent, but its
  flat-scalar storage can't hold a per-day or per-type breakdown — that needs a different
  structure, which is the same constraint §3 hits.
- **Does it print?** Catering counts and credential pulls are things a PM hands to a
  vendor. If so, that's packet or export work, not just a screen.

### Grounding

- **Today's fields:** `{key:'crew_catering', type:'text'}` and `{key:'crew_credentials',
  type:'text'}` in `EVENT_PRODUCTION_FIELDS` (`src/lib/advances/fields.ts:118-121`), group
  `Crew`, stored in the flat `info` map on `events/{id}/production/record`.
- **Numeric fields are already proven** in the same registry: `system_techs` and
  `audio_techs` are `type: 'number'` (`fields.ts:86-87`). Adding a field is appending one
  `{key,label,type,group}` object — `SectionContentForm` builds the form from the array
  and emits group headers in insertion order, and the template editor, template-push
  diff, and PDF all pick it up automatically.
- **Structured counts already exist** on labor items: `CrewLine {type, quantity, hours}`
  (`src/lib/schedules/scheduleDay.ts:28-32`), with crew types admin-managed via
  `config/crewTypes` (seeded Stagehands / Riggers / Fork-Lull Operators). This is the
  precedent for an admin-managed credential-type list, too.
- **There is no catering item type.** Catering rows on the real schedule are
  **Custom**-typed items the user named "Catering" — the six built-in types are
  production, show, travel, transportation, labor, custom.
- **Counts don't exist as a concept anywhere:** repo-wide searches for headcount, party
  size, guest count, attendee, wristband, and laminate return nothing. `hospitality-rider`
  exists only as a document *category*; "Guest Passes / Tickets" appears in an archived
  reference doc that was explicitly scoped **out** as artist-policy rather than
  tech-operational.
- **ROADMAP §5b already anticipates this ground** — it lists "credentials" and
  "hospitality/catering" as intended content for the festival production record, so this
  is filling in a known gap rather than opening a new area.

---

## 5. Scope non-PM access to what a crew member actually needs

**Status:** idea — needs a decision before it can be scoped
**Raised:** 2026-08-08
**Note (2026-08-09, updated 2026-08-10):** whenever this is scoped, the **production
director** tier ([EVENT_OVERSIGHT_ROLE_PLAN.md](archive/feature/EVENT_OVERSIGHT_ROLE_PLAN.md),
shipped 2026-08-10) belongs in the permitted set alongside organizer/admin — otherwise
oversight can read every event but not the contacts directory. **That prediction has half
come true, and from the other end: the write side moved first.** The 2026-08-10
directory-curation decision ([ROADMAP §4](ROADMAP.md)) lets a director **edit and delete any
entry** in `contacts/{id}` — the account link (`createdBy`/`userId`) stays admin-only. So the
director is now the only non-admin who can change an entry they didn't create, while **every
approved user can still read every entry**. The read rule is untouched, and the read rule is
what this entry is about. Practical consequence when this is finally scoped: the director's
place in the permitted set is settled, not open — the remaining question is only who *else*
is in it.
**Related:** [PWA_MOBILE_NAV_PLAN.md](archive/feature/PWA_MOBILE_NAV_PLAN.md) hides the cross-event Contacts
and Documents destinations from everyone outside admin / organizer / production director, but
hiding a link is cosmetic — this entry is the real access question.

### The problem

Most people on a show are crew: they're attached to one event, given read-only access, and
need that event and nothing else. They don't need the Tracker, the document library, the
contacts directory, or any other event.

Today the app only half-reflects that.

**Already correct — events.** Non-admins list events through a
`collectionGroup('members')` query, so they genuinely only see events they're assigned to.
No change needed.

**Not correct — everything else.** At the security-rules level:

- `contacts/{contactId}` — `allow read: if isActiveUser()`. **Any approved user can read the
  entire company contacts directory**: every name, phone number, email, and note, across all
  five vendor companies.
- `artistDocuments/{docId}` — `allow read: if isActiveUser()`. The whole artist document
  library, every artist, regardless of which show the reader is on.
- Per-event surfaces are member-gated, but *any* member counts — a read-only tech reads the
  full crew roster, everyone's contact details, and the complete production record for that
  event.

So a tech attached to one festival can currently read the directory and document library
for **every** festival. Nothing in the UI invites that, but nothing prevents it either.

### Open questions

- **What's the intended line?** "Organizers and admins get the cross-event surfaces;
  everyone else gets their events and nothing more" is the obvious first cut, and it maps
  onto the existing global `organizer` claim. Worth confirming that's the actual intent
  before anything is enforced. **Add the production director to that first cut (2026-08-10):**
  they already hold edit/delete on every directory entry, so a read gate that shut them out
  would be incoherent.
- **Do department leads sit with PMs or with techs?** They already have real edit authority
  within their departments, so they may need contacts even if techs don't.
- **Contacts is the hard one.** Crew arguably *do* need the contacts for their own show —
  which is the per-event crew roster, not the global directory. Splitting "directory" from
  "people on this event" may be the actual fix, and the crew roster already exists as a
  per-event surface.
- **Documents:** is the library genuinely organizer-only, or should crew see documents for
  artists on the events they're assigned to? The second is much more useful and much harder
  to express in rules (it needs a membership join per artist).
- **What breaks?** Tightening a rule that's been permissive is exactly the kind of change
  that surfaces a screen quietly depending on the wide read. The rules test suite is good
  here and should be extended first.

### Grounding

- Rules: `firestore.rules:181-182` (contacts read), `:135-136` (artistDocuments read),
  `:386-390` (per-event crew attachments, any member), `:374-384` (production record, any
  member).
- `isOrganizer()` already exists as a rules helper and is used for artistDocuments
  update/delete, so the gate is available today — the reads simply don't use it.
- Client mirror: `canCreateEvents(viewer)` = admin || organizer
  (`src/lib/rbac/permissions.ts:32`). Per-event roles are separate:
  `production-manager | department-lead | tech` (`src/lib/rbac/roles.ts:23`).
- **The directory's write gate is already scoped** (2026-08-10) — `canManageContact(viewer,
  contact)` = admin || production director || creator, mirroring the `contacts/{contactId}`
  update/delete rules. Only the **read** gate is still wide open, so this entry is narrower
  than it was: it is now about reads.
- **No global "is a PM" state exists** — PM is per-event, so a user can be a PM on one show
  and a tech on another. Any global gate has to key on `organizer`/`admin`/
  `productionDirector`.
- Attaching someone as crew auto-enrolls their account as a Tech on that event
  (`EventContactsPanel.tsx:150-162`), so crew accounts arrive with member-level read
  automatically.

---

## Findings worth acting on separately

> ### ✅ RESOLVED — non-admins could not open an event by slug (found + fixed 2026-08-10)
>
> **Confirmed in production, then fixed.** Everything below is kept as the investigation
> record, including the theories that turned out to be wrong; the resolution is at the end.
>
> **Root cause (all of it).** `EventDetailScreen` canonicalizes `/events/{id}` → `/events/{slug}`
> once the event loads. So a member's *first* read succeeded by doc id — which is why the
> instrumented trace showed `getEvent ok: FOUND` — and every read *after* the redirect was keyed
> on the slug, which they cannot resolve. The schedule route survived because it does not
> canonicalize. That single line explains the entire confusing signature and the three refuted
> theories below.
>
> **Fixed** by making `getEventBySlugOrId` resolve in three steps — slug query, doc id, then a
> membership-scoped slug match reached only when the slug query was *denied*. Denials are
> handled narrowly (`permission-denied` only) so an outage is never laundered into "no such
> event". Covered by six unit tests and two emulator E2E tests; both suites were
> mutation-checked against the pre-fix resolver and fail exactly where they should. The
> regression test signs in as `tech` — every prior routing test used `admin`, which is precisely
> how this shipped.
>
> ### ⚠ Original report — non-admins may not be able to open an event by slug (found 2026-08-10)
>
> **Severity: potentially user-blocking. Not yet confirmed against production data.** Found
> by a new emulator test while building the nav; unrelated to that work, and **not** caused by
> the production-director change (see below).
>
> `EventsListScreen.tsx:307` links to `` /events/${e.slug ?? e.id} ``, so any event carrying a
> `slug` is navigated to by slug. `getEventBySlugOrId` (`events-service.ts:77`) resolves that
> in two steps, and for a plain member **both steps are denied**:
>
> 1. `query(events, where('slug','==',param), limit(1))` — Firestore refuses the list query,
>    because the read rule is `canReadEvent(eventId)` and satisfying it for a member requires a
>    per-document `exists()` membership lookup.
> 2. the fallback `getEvent(param)` — a getDoc on the **slug string** as if it were a doc id.
>    That document does not exist, and for a non-member the rule denies rather than returning
>    empty, so it throws instead of yielding `null`.
>
> The screen then renders "Failed to load this event." Admins and production directors escape
> both branches because `canOverseeAllEvents()` is unconditionally true, which is why every
> existing test missed it — **`event-routing.emulator.spec.ts` only ever signs in as `admin`,
> and no emulator test had opened an event detail screen as a plain member.**
>
> Measured directly against the rules (temporary diagnostic, since removed):
>
> | Actor | Operation | Result |
> | --- | --- | --- |
> | PM (member) | slug query on their own event | **denied** |
> | PM (member) | getDoc by the slug string | **denied** |
> | PM (member) | getDoc by real doc id | allowed |
> | Production director | same slug query | allowed |
>
> **Not a regression from the director work.** Before `6d7d55b` the gate was
> `isAdmin() || isMember(eventId)`; after, `canReadEvent(eventId)` =
> `isAdmin() || isProductionDirector() || isMember(eventId)`. For a member both reduce to
> `isMember(eventId)`. The director branch only ever adds access.
>
> **A second, sharper symptom — NOT root-caused.** With the slug removed from the picture
> entirely, a PM opening `/events/e2e-event-alpha` (raw doc id) still lands on "Failed to load
> this event.", while the same persona opening `/events/e2e-event-alpha/schedule` — same id,
> same `getEventBySlugOrId` fetcher, same React Query key — renders correctly. Confirmed with
> an instrumented browser run. The only console noise is the Functions emulator being absent
> (`syncUserClaims` → `ERR_CONNECTION_REFUSED`, AuthProvider falls back to the token's claims),
> which affects both routes equally and so does not explain the split.
>
> **The decisive observation.** An instrumented run logging inside `getEventBySlugOrId` shows
> the member's FIRST read succeeding and only later ones failing:
>
> ```
> detail:    slug-query → permission-denied   (caught, expected)
>            getEvent   → FOUND               ← the member CAN read the doc
>            …then 3× { slug-query denied, getEvent → permission-denied }
> schedule:  slug-query → permission-denied   (caught)
>            getEvent   → FOUND               ← one fetch, no refetch, screen renders
> ```
>
> So it is **not** that a member cannot read the event. They read it, then a **refetch** is
> denied, and React Query exhausts its retries into `isError`. The schedule screen never
> refetches, which is why it survives. Whatever revokes the read does so between fetches.
>
> **Three theories tested and REFUTED** — recorded so nobody re-walks them:
>
> | Theory | Test | Result |
> | --- | --- | --- |
> | A denied query poisons later reads on the same client | denied query then getDoc on one client, rules harness | **No** — `queryDenied=true, docExists=true` |
> | An artifact of the absent Functions emulator (`syncUserClaims` failing) | re-ran with `--only auth,firestore,storage,functions` | **No** — still never renders; zero console errors, stuck retrying |
> | A race with the post-sign-in token refresh in `applyClaims` | landed on `/events` and let it settle before navigating | **No** — identical failure settled or not |
>
> Still unexplained, and deterministic. Remaining lead: `EventDetailScreen.tsx:160` does **not**
> use `useResolvedEvent` — it re-declares an inline `useQuery` on the same
> `['events','detail',param]` key, exactly the duplication `useResolvedEvent`'s own doc comment
> warns against — and the detail screen fans out far more mount-time queries than the schedule
> screen. Neither yet explains why a *refetch* loses permission.
>
> **Reproduce against a real non-admin account before drawing conclusions.** If it reproduces,
> PMs cannot open an event detail page at all, which is far more serious than the slug half.
>
> **There is a latency cost even when the slug is not involved.** Step 1 runs *unconditionally*
> — the resolver always tries the slug query before falling back — so **every event page load
> for every non-admin, non-director user** pays a denied Firestore round trip, plus the SDK's
> retries on `PERMISSION_DENIED`, before the getDoc that actually works. Measured in the
> emulator this pushed a by-ID event load past 5 seconds from cold. Even if the slug bug turns
> out to be unreachable in production, this half is real for the majority of users, on every
> event they open.
>
> **Before treating this as live, check whether production events actually carry `slug`.** If
> most predate slug reservation and the field is null, the link falls back to `e.id` and real
> users never hit it — which would explain the silence. That check is the first step.
>
> Likely fixes, in order of preference: have the events list link by `e.id` (one line, no rules
> change); or make `getEventBySlugOrId` resolve the slug from the memberships the viewer can
> already read instead of a collection query; or catch `permission-denied` in `getEvent` and
> return `null` so the fallback degrades to "not found" rather than an error. A rules change is
> **not** obviously right — the list query is genuinely unsafe to allow.

Small documentation-accuracy issues surfaced while grounding the above. Independent of
whether either idea gets built:

- ~~**`AGENTS.md` canonical-sources table lists `effectiveLogos`**, which was deliberately
  deleted.~~ **Fixed 2026-08-10.** The row now names only `logoForBackground` and carries the
  warning from the tombstone comment, so the table itself says not to reintroduce it.
- ~~**`AGENTS.md` lists `src/lib/hooks/useModalState.ts`** as the canonical modal-state
  module. It does not exist.~~ **Fixed 2026-08-10** — the row and the project-structure comment
  both now say it is not created yet, so it can't be cited as existing.
- ~~**`.claude/rules/code-organization.md:61` reports `EventsListScreen` at complexity 23**;
  the measured value is **20**.~~ **Fixed 2026-08-10 — and this finding was itself wrong.**
  Re-measured with ESLint: **21**, not 23 and not 20. The rule doc now carries the corrected
  figure plus a caveat that the rest of that 2026-07-23 audit may have drifted the same way.
- **Deleting a festival has no referential-integrity check** — events keep a dangling
  `festivalId` (degrades gracefully: name falls back to the stored value, logo to the
  override) and the festival's logo objects are orphaned in Storage. Worth a look if
  festivals become more prominent in the UI.
- **Calendar events show raw field keys.** The ICS builder dumps schedule-item detail
  fields as `` `${key}: ${value}` `` (`functions/src/lib/schedules/itemEvent.ts:44`), so a
  travel item lands in someone's calendar as `carrier: Delta` / `confirmation: ABC123`,
  while the same item in the app reads `Carrier: Delta`. User-visible, and any new field
  inherits it. The PDF has the same class of issue from the other direction — it
  title-cases the raw key (`humanize`, `packet.tsx:87`) instead of using the registry's
  label.
- **Two unlinked "people on this event" surfaces.** The crew roster
  (`events/{id}/contacts`, joined to the contacts directory) and
  `EventProduction.contacts[]` (a hand-typed `{role,name,phone,email}` array on the
  production record) coexist and never reference each other. Worth reconciling before a
  third one gets added.
- **The schedule item-type list is duplicated server-side.** `functions/src/scheduleTemplateSeed.ts:25`
  hardcodes the same six item types as the client registry, so adding a type means editing
  both.
