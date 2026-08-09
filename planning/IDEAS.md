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

## 1. Mobile: collapse the top nav into a dropdown

**Status:** idea — pattern decided (dropdown), layout and contents open
**Raised:** 2026-08-08

### The problem

The top nav is too crowded on phones. Measured on production while signed in as an admin:

| Piece | Width |
| --- | --- |
| Brand lockup (mark + "ADVANCE") | 120px |
| 7 nav items + gaps | 526px |
| Header padding | 32px |
| **Total needed** | **~678px** |
| Available on a typical phone | 360–430px |

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

## Findings worth acting on separately

Small documentation-accuracy issues surfaced while grounding the above. Independent of
whether either idea gets built:

- **`AGENTS.md` canonical-sources table lists `effectiveLogos`**, which was deliberately
  deleted. `src/lib/branding/logo.ts:65-68` is a tombstone comment explaining why it was a
  trap and warning against reintroducing it. The table entry points at a ghost.
- **`AGENTS.md` lists `src/lib/hooks/useModalState.ts`** as the canonical modal-state
  module. It does not exist — `src/lib/hooks/` contains only `useBeforeUnload.ts`. (The
  table is documented as "create on first use", so this is aspirational rather than wrong,
  but it reads as existing.)
- **`.claude/rules/code-organization.md:61` reports `EventsListScreen` at complexity 23**;
  the measured value is **20**. The audit note it came from predates a refactor.
- **Deleting a festival has no referential-integrity check** — events keep a dangling
  `festivalId` (degrades gracefully: name falls back to the stored value, logo to the
  override) and the festival's logo objects are orphaned in Storage. Worth a look if
  festivals become more prominent in the UI.
