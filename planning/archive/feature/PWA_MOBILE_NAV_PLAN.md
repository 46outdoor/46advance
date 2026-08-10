# PWA narrow-screen navigation — design

Graduated from [IDEAS.md §1](../../IDEAS.md) on 2026-08-08.

> **Status: COMPLETE (2026-08-10) — built, released, and verified in production.** All six
> items are implemented: the registry (`src/lib/nav/items.ts`), the narrow disclosure in
> `AppShell.tsx`, the `cross-event` rule and both its consumers, Templates/Schedule templates
> in the narrow menu, the 44px targets and email cap, and the tests. Merged as #279, released
> to Hosting in `e0a5d542`. The prerequisite production-director tier shipped earlier the same
> day ([archived plan](EVENT_OVERSIGHT_ROLE_PLAN.md)).
>
> **The breakpoint is 880px, not the 800px this plan originally specified.** Statements of what
> was built now say 880; the *rationale* in [Breakpoint](#breakpoint) is left at 800 as written,
> under its own dated note, because that argument is the historical record of how the number
> was chosen — and re-deriving it is exactly what the 880 revision did. The plan also called for
> a Tailwind `min-[800px]:` variant; that was **not** used. Exactly one presentation is mounted
> at a time via `matchMedia`, because two `<nav>` landmarks both named "Main navigation" is an
> a11y defect, and jsdom applies no Tailwind, which would make every component test ambiguous.
>
> **Three amendments made while building**, recorded inline rather than silently applied:
> `pm-or-oversight` delegates to `canViewTracker` instead of restating it
> ([registry](#enabling-refactor-a-nav-registry)); `cross-event` gained the production director
> so a director can reach the Contacts directory they now curate
> ([Already in place](#already-in-place-2026-08-10)); and the breakpoint moved 800 → 880.
>
> ### What was verified, and how
>
> Being specific, because "verified" covers two different levels of evidence here.
>
> | | Production (real account) | Emulator E2E (CI, Linux) |
> | --- | --- | --- |
> | Tech narrow menu — Events + account only | ✅ | ✅ |
> | 44px targets, brand link, no overflow | ✅ | ✅ |
> | 879 → 880 switch, open state cleared | ✅ | ✅ |
> | Inline row on one line | ✅ (tech, 4 items) | ✅ (admin — the case that wrapped) |
> | PM / lead / organizer / **director** / **admin** menus | ✗ | ✅ |
> | Axe with the disclosure open | ✗ | ✅ |
> | Short-landscape panel scroll, Sign out reachable | ✗ | ✅ |
>
> The production pass used a `tech` account (`jared@jaredfoh.com`), the first non-oversight
> account the app has ever had. The director and admin menus were not exercised by hand — no
> director credentials, and using the owner's admin session was not appropriate. The admin
> inline row is the one that wrapped on Linux CI at 800px, so that case in particular rests on
> CI rather than on a browser anyone looked at.

Scope: the authenticated **PWA** header on narrow screens. This is unrelated to the planned
native Expo app under `mobile/`. The desktop presentation stays inline, but the same
role-aware visibility policy applies at every width; constraining the desktop email is also
in scope (see [Breakpoint](#breakpoint)).

---

## Decisions

| Question | Decision |
| --- | --- |
| Narrow-screen pattern | A **dropdown disclosure** behind a single trigger |
| Trigger | **Hamburger**, holding navigation *and* identity |
| Inline navigation below the breakpoint | **Nothing** — brand + trigger only |
| Newly surfaced routes | **Tracker** for PMs and oversight; **Templates** and **Schedule templates** for admins |
| Inline breakpoint | **880px** — `INLINE_NAV_MIN_WIDTH`, applied via `matchMedia`, not a Tailwind variant (revised from 800 during the build; see [Breakpoint](#breakpoint)) |
| Role policy | Cross-event Contacts/Documents for **admin, organizer, or production director** (director added 2026-08-10); Tracker for **admin, production director, or a PM on ≥1 event** |
| Menu semantics | **Disclosure**, not `role="menu"` — see [Accessibility](#interaction--accessibility) |

## Already in place (2026-08-10)

The production-director work built the whole Tracker half of this plan, including the async
gate that was its riskiest piece. Do **not** rebuild these:

| This plan calls for | Status |
| --- | --- |
| An `isProductionDirector` signal in auth state | **Done** — `useAuth()` returns it |
| A `pm-or-oversight` rule (`isAdmin ∨ isProductionDirector ∨ isPmSomewhere`) | **Done** — `canViewTracker(viewer, isPmSomewhere)` in `src/lib/rbac/permissions.ts`, tri-state, unknown → hidden |
| Deriving "PM on ≥1 event" without a second `collectionGroup` read | **Done** — `useMyEventMemberships()` + `isProductionManagerSomewhere()` (`src/lib/rbac/my-memberships.ts`), one shared query |
| Tracker hidden from leads/techs in the header | **Done** — `AppShell.tsx:66` |
| Gating the Events-header Tracker link (`EventsListScreen.tsx`) | **Done** — `EventsListScreen.tsx:180,217`, covered by `EventsListScreen.trackerGate.test.tsx` |
| Route guards behind the hidden links | **Done** — `/tracker` and `/tracker/:eventId` refuse and redirect; see their `*.test.tsx` |
| A `director` E2E persona | **Done** — plus `directorTech`, in `tests/emulator/personas.ts` |

**Consequence for the visibility matrix:** `pm-or-oversight` should resolve through the
existing `canViewTracker` rather than a second nav-local predicate. That contradicts the
[registry section's](#enabling-refactor-a-nav-registry) instruction to resolve *every*
`visibility` value in one nav-local function — the note there is amended. Only `cross-event`
is genuinely presentational and nav-local; `pm-or-oversight` is already a canonical predicate
with tests, and duplicating it would create exactly the drift this plan exists to prevent.

**`cross-event` now includes the production director (decided 2026-08-10).** The same
decision that gave the director curation of the global contacts directory
([ROADMAP §4](../../ROADMAP.md)) put them in this rule, so the population is
**admin ∨ organizer ∨ production director** everywhere below. Documents comes along
because it shares the rule — one rule is simpler than two, and the director's document access
is unchanged either way. The rule stays nav-local and stays presentation: the directory write
it accompanies is a real rules change, but `contacts/{id}` **reads** are untouched.

### What remained — all built 2026-08-10

Kept as the delivery record; each line names where it landed.

1. ~~The registry.~~ `src/lib/nav/items.ts` — `NAV_ITEMS`, `resolveNavVisibility`,
   `visibleNavItems`/`visibleNavGroup`, `INLINE_NAV_MEDIA_QUERY` derived from
   `INLINE_NAV_MIN_WIDTH` so the CSS breakpoint and the `matchMedia` string cannot drift.
2. ~~The narrow disclosure.~~ `AppShell.tsx` — trigger, overlay panel,
   open/close/Escape-with-focus-return/outside-click/route-change (keyed on
   pathname+search+hash), and the breakpoint state clear. No `role="menu"`, no focus trap, no
   scroll lock. `src/hooks/useMediaQuery.ts` is the new shared hook.
3. ~~`cross-event` and its two consumers.~~ Both nav presentations plus the
   `Manage directory →` link in `EventContactsPanel.tsx`, all resolving through the one rule.
4. ~~Templates and Schedule templates in the narrow menu.~~ Narrow-only, as designed.
5. ~~44px targets, brand-link `min-h-11`, `max-w-40 truncate` email cap.~~ Applied to the
   interactive elements themselves, not their `<li>`s.
6. ~~Tests.~~ `nav-disclosure.emulator.spec.ts` (new) and a rewritten
   `responsive-accessibility.emulator.spec.ts` — its old assertion that `pm` **can** see
   Contacts and Documents was inverted, not extended. Plus `src/lib/nav/items.test.ts`,
   `AppShell.test.tsx`, `useMediaQuery.test.ts`, and `EventContactsPanel.crossEvent.test.tsx`.

**One gate worth knowing about for next time:** the emulator specs are **not** covered by
`npm run typecheck`. The root tsconfig is solution-style and references only
`tsconfig.app.json` and `tsconfig.node.json`; `tests/` lives in `tsconfig.test.json`, which
nothing references. They are checked only by the separate **`npm run typecheck:tests`**. A
type error in a spec sails through `tsc -b` untouched — that happened during this build.

## Why

Measured on production, signed in as an admin (nav item widths + 16px column gaps +
120px brand lockup + 32px header padding):

| Header contents | Width needed |
| --- | --- |
| Full row incl. email (`sm:` and up) | **750px** |
| Row without email (below `sm:`) | **573px** |
| Links only, if identity moves into a menu | **492px** |

The nav is `flex-wrap`, so it never overflows — it **wraps to a second row**, which is why
this reads as "crowded" rather than broken and why the existing 390×844 test passes.

Two consequences worth naming:

1. **It wraps at every width below 750px**, not just phones. The 640–749px band is the
   worst case, because that's where `sm:` reveals the email and *adds* 177px to a row
   that already didn't fit.
2. **`display: 'standalone'`** in the PWA manifest means there's no browser chrome once
   installed — this header is the only navigation, so a wasted second row is permanent.

Separately, the current nav actions do not meet the project's own 44px rule: `Sign out`
is `px-2 py-1 text-xs`, the Admin pill is `px-1.5 py-0.5 text-[0.6rem]`, and the three
text links have no padding. The brand home link also drops to roughly 32px tall when the
header shrinks, so it needs its own narrow-screen `min-h-11` guard.

## Layout

**Below the breakpoint (880px) — brand + trigger, one row.**

```
┌────────────────────────────────┐
│  [46] ADVANCE             ☰    │
└────────────────────────────────┘
```

**Open menu — the contents are role-aware** (see below). An admin sees the most:

```
┌────────────────────────────────┐
│  Events                        │
│  Contacts                      │
│  Documents                     │
│  Tracker                       │
├────────────────────────────────┤
│  ADMIN                    (2)  │   ← accent, keeps the pending-approval badge
│  Templates                     │
│  Schedule templates            │
├────────────────────────────────┤
│  Settings                      │
│  jared@46entertainment.com     │   ← muted label, not interactive
│  Sign out                      │
└────────────────────────────────┘
```

A **production director** sees the same destinations without the admin group. Contacts and
Documents are there because the 2026-08-10 decision put the director in the `cross-event`
rule — the director curates the contacts directory ([ROADMAP §4](../../ROADMAP.md)), and Documents
shares the rule:

```
┌────────────────────────────────┐
│  Events                        │
│  Contacts                      │
│  Documents                     │
│  Tracker                       │
├────────────────────────────────┤
│  Settings                      │
│  dana@46entertainment.com      │
│  Sign out                      │
└────────────────────────────────┘
```

A PM (on at least one event) who is **not** a global organizer or director sees Events plus
their Tracker:

```
┌────────────────────────────────┐
│  Events                        │
│  Tracker                       │
├────────────────────────────────┤
│  Settings                      │
│  priya@46entertainment.com     │
│  Sign out                      │
└────────────────────────────────┘
```

A department lead or tech — **the most common case** — sees only their events and their
account:

```
┌────────────────────────────────┐
│  Events                        │
├────────────────────────────────┤
│  Settings                      │
│  tara@46entertainment.com      │
│  Sign out                      │
└────────────────────────────────┘
```

**At 880px and up — inline presentation**: brand, permitted inline links, email, Sign out.
The presentation stays as it is today, but the role policy below now applies consistently,
so someone outside admin / organizer / production director no longer sees Contacts/Documents
in the desktop bar either. Tracker and the two template destinations remain dropdown-only
because adding them to the inline bar would push the row to roughly 1050px.

### Role-aware contents

The global `organizer` and `productionDirector` claims and the per-event roles answer
different questions. A person may be a production manager on one event and a tech on another
without holding either global claim. Do **not** treat `organizer` as a synonym for production
manager, or `productionDirector` as a synonym for either.

| Item | Visible to | Reason |
| --- | --- | --- |
| Events | everyone | Non-admin results are already membership-scoped |
| Tracker | **admin, production director, or PM on ≥1 event** | A PM tool; leads and techs don't run the advance |
| Contacts, Documents | **admin, organizer, or production director** | Cross-event production-management surfaces. The director joined on 2026-08-10, when directory curation became theirs |
| Admin, Templates, Schedule templates | **admin** | All routes sit behind `AdminGate` |
| Settings, email, Sign out | everyone | Personal account actions |

**Which signal gates cross-event navigation.** Use
`isAdmin || isOrganizer || isProductionDirector` from the existing auth state. This is a
discoverability policy for cross-event surfaces, not a new authorization capability and not a
reason to reuse the semantically unrelated `canCreateEvents` predicate. Keep the resolver with
the nav registry rather than naming it like a Firestore permission.

The three signals land in this one rule for three different reasons, which is why it is a
nav-local list and not a predicate borrowed from elsewhere: admin is unrestricted, organizer
curates the document library, and the production director curates the contacts directory
(decided 2026-08-10 — [ROADMAP §4](../../ROADMAP.md)). Documents is in the director's menu only
because it shares the rule; the owner's position is that it doesn't matter either way, and one
rule is simpler than two. If those populations ever need to diverge, split the value in two —
don't quietly reinterpret this one.

**Tracker is the one asynchronous gate.** Admin and production director resolve synchronously
from auth state, but "is a PM on at least one event" has to be derived from a
`collectionGroup('members')` read. Treat the unresolved state as **not visible**, so the link
never flashes in and then disappears. **This is already built** — the shared query is
`useMyEventMemberships()` and the tri-state rule is `canViewTracker()`; consume them rather
than re-deriving. The production-director tier is specified in
[EVENT_OVERSIGHT_ROLE_PLAN.md](EVENT_OVERSIGHT_ROLE_PLAN.md) and shipped
2026-08-10.

> **⚠ Hiding a link is not access control.** At the rules level, `contacts/{id}` and
> `artistDocuments/{id}` are both `allow read: if isActiveUser()` — *any* approved user can
> read the entire contacts directory and the whole document library, and can still reach
> `/contacts` or `/documents` by typing the URL. If everyone outside the `cross-event` set
> genuinely shouldn't *access* those, that's a security-rules change and a separate piece of
> work, tracked as [IDEAS §5](../../IDEAS.md). This plan only changes what the nav offers.
>
> The 2026-08-10 director decision does not change this. It tightened nothing: it *widened*
> `contacts/{id}` **update/delete** for the director claim. The **read** rule is the one
> IDEAS §5 is about, and it is untouched.
>
> Events and Tracker are already scoped correctly: non-admins resolve events through a
> `collectionGroup('members')` query, so both surfaces only contain assigned events.

### Grouping rationale

- **Destinations** (Events, Contacts, Documents, Tracker) — day-to-day. Tracker is a
  production-management tool: a PM sees their own events' completion, and admin/production
  director see every event. Department leads and techs don't get it at all. Contacts and
  Documents are cross-event directories, so their navigation entries follow the global
  admin/organizer/production-director presentation policy.
- **Admin** (Admin, Templates, Schedule templates) — all three sit behind `AdminGate` in
  `App.tsx`, so they share one gate and one group. Admin leads the group and keeps its
  accent styling and pending count, since that badge is a standing nudge.
- **Account** (Settings, email, Sign out) — personal, and last, matching where users
  expect account actions to live.

## Breakpoint

> **Revised to 880px on 2026-08-10, during implementation.** The reasoning below still holds —
> it is the reasoning that condemned 800. The 44px touch targets widened the row *after* the
> 750px measurement was taken (Admin pill `px-1.5`→`px-3`, Sign out `px-2`→`px-3`), so the real
> requirement is now **788px**, measured in Chromium with an admin and the identity span at its
> full 160px cap (brand 120 + nav 636 + 32 header padding). At 800px that is **12px** of
> tolerance — it passed on macOS and **wrapped on Linux CI**, where the row silently grew a
> second line. 880px restores ~92px of headroom. The value lives in one constant,
> `INLINE_NAV_MIN_WIDTH`, so the CSS breakpoint and the `matchMedia` string cannot drift.
>
> The lesson generalises: a breakpoint derived from a measurement has to be re-derived whenever
> anything in the row changes size. Read "800px" below as 880px throughout.

**~~800px~~ 880px**, from the `INLINE_NAV_MIN_WIDTH` constant.

The full inline row currently needs 750px, including the header padding. Switching at the
named `md:` breakpoint (768px) would leave only 18px of tolerance for font metrics, a
pending-count badge, and identity text. The originally suggested `max-w-[12rem]` email cap
would not fix that: replacing the measured 161px email with a possible 192px flex item
raises the row to roughly 781px.

At the breakpoint, constrain the desktop email flex item with `max-w-40 truncate` (160px) and
`min-w-0`; keep the complete address as the text content so assistive technology still
receives it. The narrow-screen email label also needs `min-w-0` plus truncation or safe
wrapping so an unusually long address cannot widen the panel.

The presentation switch and the `matchMedia` query that clears open menu state must stay
identical — both read the single `INLINE_NAV_MIN_WIDTH` constant, and a unit test asserts the
query string is derived from it rather than duplicated. Cover the 879/880px boundary in tests.

## Panel geometry

The dropdown is an overlay anchored immediately below the sticky header; opening it must
not push the page body down or change the header's scroll thresholds. The panel spans the
narrow viewport, stays above page content, and has a border/shadow separating it from the
screen below.

An admin menu has ten 44px rows before separators and will not fit on a phone in landscape.
Cap it to the available dynamic viewport height and make the panel itself vertically
scrollable (`overflow-y-auto overscroll-contain`). The final Sign out action must remain
reachable at short viewport heights. Do not rely on scrolling the oversized sticky header.

## Interaction & accessibility

**Use a disclosure pattern, not `role="menu"`.** `role="menu"`/`menuitem` implies
application-menu semantics (arrow-key navigation, "menu" announced to screen readers) and
is meant for commands, not a list of destinations. A `<button aria-expanded aria-controls>`
toggling a `<nav>` of links is the correct shape, and Tab works naturally.

- Trigger: `<button aria-expanded aria-controls="…" aria-label="Main navigation">`,
  `min-h-11 min-w-11`; the decorative hamburger glyph is `aria-hidden`.
- Brand home link: `min-h-11` below the breakpoint even when its visible mark shrinks to 32px.
- Panel: `<nav aria-label="Main navigation">` wrapping a `<ul>`.
- Apply `min-h-11` to each actual interactive `<a>`/`button`, not only to its `<li>`.
- Render destination links with `NavLink` (or equivalent) so the current destination has
  `aria-current="page"` and an active visual state. Parent destinations stay current on
  their descendant routes.
- Opening leaves focus on the trigger; the next Tab moves naturally to the first link.
- **Escape** closes from anywhere while the disclosure is open and returns focus to the
  trigger.
- **Click/tap outside** closes.
- **A route change closes it**, including search/hash changes — easy to miss because
  `AppShell` persists across protected routes.
- Crossing to the inline breakpoint closes and clears menu state, so rotating or resizing
  back to narrow mode cannot resurrect a stale open panel.
- **No focus trap and no page scroll lock.** This is a non-modal disclosure, not a dialog —
  Tab should be able to leave. The panel's own overflow handles short screens. (If it later
  becomes a full-screen sheet, `PhotoEditor.tsx` is the in-repo modal trap to copy: focus on
  open, Tab cycle, Escape, restore.)
- The header keeps its existing scroll-shrink behaviour; both the trigger and linked brand
  remain at least 44px tall in the shrunk state.

`AdminTabBar` (`src/features/admin/AdminScreen.tsx:22-79`) is useful only as an in-repo
example of 44px targets and explicit ARIA. Do **not** copy its `tablist`, roving-tabindex,
arrow-key, or selection behaviour: those semantics belong to tabs, not this disclosure.

## Enabling refactor: a nav registry

Nav links are hardcoded inline in `AppShell.tsx` today — no registry, no shared source of
truth tying a route to a label. That's precisely how Tracker and the template screens
drifted out of the nav in the first place, and a second presentation doubles the chance of
drift.

Extract destination metadata to `src/lib/nav/items.ts`, mirroring the placement of
`src/lib/admin/tabs.ts`. Use explicit fields rather than an optional `inBar` whose default
could be misunderstood:

```typescript
type NavPlacement = 'narrow' | 'inline';
type NavVisibility = 'all' | 'pm-or-oversight' | 'cross-event' | 'admin';

interface NavItem {
  id: string;
  to: string;
  label: string;
  group: 'destinations' | 'admin' | 'account';
  visibility: NavVisibility;
  placements: readonly NavPlacement[];
}
```

The registry contains destination links, including Settings. Email and Sign out remain
runtime account content rendered after that group's links; the Admin badge remains runtime
decoration keyed by the stable Admin item id.

- `visibility` resolves once through a pure nav-specific function: `all`;
  `pm-or-oversight`; `cross-event` (`isAdmin || isOrganizer || isProductionDirector`, the
  director added 2026-08-10); or `admin`. Unit-test this matrix directly. It is a
  presentation rule, not access control. Only `pm-or-oversight`
  depends on an async input, so the resolver takes `isPmSomewhere` as an explicit tri-state
  (`true | false | unknown`) rather than reading a query itself — that keeps it pure and
  makes the loading policy testable.
- **Amended 2026-08-10:** `pm-or-oversight` must **delegate to the existing
  `canViewTracker(viewer, isPmSomewhere)`** in `src/lib/rbac/permissions.ts`, not restate
  `isAdmin || isProductionDirector || isPmSomewhere`. That predicate now backs three call
  sites and two route guards; a fourth nav-local copy is precisely the drift this registry
  exists to prevent. `cross-event` stays nav-local — it is genuinely presentational and has
  no rules counterpart (see the warning above). Note that it is **not** `canManageContact`
  either: that predicate answers "may this viewer edit this contact?", which is a different
  question from "should the directory be offered in the nav?", and it is admin/director/creator
  — no organizer.
- `placements` is always explicit. Events, Contacts, Documents, Admin, and Settings render
  in both presentations; Tracker, Templates, and Schedule templates render only in
  `narrow`.
- Both presentations filter and render from this one registry so labels, destinations, and
  role behavior cannot drift accidentally.

## Test impact

**Update `tests/emulator/responsive-accessibility.emulator.spec.ts`.** It currently signs in
as `PERSONAS.pm`, whose claims are `{ approved: true }` — deliberately neither a global
organizer nor a production director, so it stays outside `cross-event` — and who is seeded as
`production-manager` on `e2e-event-alpha`. At 390×844, open the disclosure and assert that
this persona sees Events, Tracker, and account content but not Contacts, Documents, or
admin-only links. Keep its `scrollWidth <= clientWidth` assertion.

The seeded personas already cover the whole matrix with no new fixtures — `pm` is PM on
alpha, `lead` is department-lead on alpha, `tech` is tech on alpha, `crossEvent` is PM on
beta, plus `organizer` and `admin`. The `director` persona (and `directorTech`) were added by
[EVENT_OVERSIGHT_ROLE_PLAN.md](EVENT_OVERSIGHT_ROLE_PLAN.md) and are already
seeded.

Required coverage:

- Pure unit test for every `visibility` × viewer combination and for explicit placements,
  including `isPmSomewhere: unknown` resolving to hidden.
- PM narrow menu: Events + Tracker + account only.
- **Lead and tech narrow menus: Events + account only — no Tracker.** This is the assertion
  that catches the gate silently failing open.
- Organizer narrow menu: Events + Contacts + Documents + account, no admin group.
- Director narrow menu: Events + Tracker + Contacts + Documents + account, no admin group —
  Tracker via oversight rather than membership, Contacts/Documents via `cross-event` since
  2026-08-10. Assert the admin group is absent: this persona is the one that now sees every
  destination group but that one.
- Admin narrow menu: every item plus the pending-approval badge.
- Menu opens/closes; outside click closes; Escape closes and restores trigger focus.
- Opening keeps trigger focus; Tab reaches the first visible link.
- Navigating, changing location search/hash, and crossing the breakpoint all clear open state.
- Current destination exposes `aria-current="page"`, including descendant routes.
- Axe passes with the disclosure open.
- Trigger, brand link, and every interactive row measure at least 44px.
- 879px uses the disclosure and 880px uses the inline row without wrapping; a long email
  stays constrained in both presentations.
- At a short landscape-height viewport, the panel scrolls and Sign out remains reachable.
- The document-level `scrollWidth <= clientWidth` overflow guard remains true.

Use focused component tests for registry/filtering, focus, route-change, and breakpoint
state; keep emulator E2E for the real persona claims, rendered dimensions, and axe checks.

## Out of scope

- **Inline navigation still does not include Tracker, Templates, or Schedule templates.**
  Fixing that means an overflow disclosure at all widths — a bigger question, deliberately
  deferred.
- **The brand lockup is duplicated in three places** (`AppShell`, `LandingScreen`,
  `PrivacyScreen`), so this change doesn't reach the signed-out screens. Unifying them is
  a separate cleanup.
- Tightening Firestore rules or adding route guards for Contacts/Documents; tracked in
  [IDEAS §5](../../IDEAS.md).
- Building the production-director tier itself (claim, rules, `listEvents`/`listVisibleEvents`
  scoping); specified in
  [EVENT_OVERSIGHT_ROLE_PLAN.md](EVENT_OVERSIGHT_ROLE_PLAN.md) and **shipped
  2026-08-10**. This plan consumes `isProductionDirector` and does not create it.
- No change to routing, auth, or any other screen body.

## In-app links must honour the same policy

**In scope, and easy to forget.** Hiding a destination from the navigation accomplishes
nothing while another screen still links to it. Two links defeated the policy above; **one
has since been fixed**:

- ~~**`src/features/events/EventsListScreen.tsx:208`** — the Tracker link in the Events
  header is ungated.~~ **Fixed 2026-08-10** by the production-director work: the link now
  resolves through `canViewTracker` at `EventsListScreen.tsx:180`, with coverage in
  `EventsListScreen.trackerGate.test.tsx`. The event-detail header's Tracker link was gated
  in the same pass.
- **`src/features/events/EventContactsPanel.tsx:193`** — the Crew panel's "Manage directory →"
  link renders for every event member, above the `canEdit` block, pointing at `/contacts`,
  which this plan hides from everyone outside the `cross-event` set. Must follow the same
  `cross-event` rule — including the production director, who reaches the directory to curate
  it. (The second `/contacts` link in that file, at `:236`, already sits inside `canEdit` and
  is fine.)

Resolve both through the same predicates the nav registry uses, so there is one answer per
capability rather than three.
