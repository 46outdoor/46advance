# PWA narrow-screen navigation — design

Graduated from [IDEAS.md §1](IDEAS.md) on 2026-08-08. Design agreed; **not yet built**.

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
| Inline navigation below 800px | **Nothing** — brand + trigger only |
| Newly surfaced routes | **Tracker** for PMs and oversight; **Templates** and **Schedule templates** for admins |
| Inline breakpoint | **800px** (`min-[800px]:`) — see rationale below |
| Role policy | Cross-event Contacts/Documents for **organizer or admin**; Tracker for **admin, production director, or a PM on ≥1 event** |
| Menu semantics | **Disclosure**, not `role="menu"` — see [Accessibility](#interaction--accessibility) |

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

**Below 800px — brand + trigger, one row.**

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

**At 800px and up — inline presentation**: brand, permitted inline links, email, Sign out.
The presentation stays as it is today, but the role policy below now applies consistently,
so a non-organizer no longer sees Contacts/Documents in the desktop bar either. Tracker and
the two template destinations remain dropdown-only because adding them to the inline bar
would push the row to roughly 1050px.

### Role-aware contents

The global `organizer` claim and per-event roles answer different questions. A person may
be a production manager on one event and a tech on another without being a global
organizer. Do **not** treat `organizer` as a synonym for production manager.

| Item | Visible to | Reason |
| --- | --- | --- |
| Events | everyone | Non-admin results are already membership-scoped |
| Tracker | **admin, production director, or PM on ≥1 event** | A PM tool; leads and techs don't run the advance |
| Contacts, Documents | **organizer or admin** | Cross-event production-management surfaces |
| Admin, Templates, Schedule templates | **admin** | All routes sit behind `AdminGate` |
| Settings, email, Sign out | everyone | Personal account actions |

**Which signal gates cross-event navigation.** Use `isAdmin || isOrganizer` from the
existing auth state. This is a discoverability policy for cross-event surfaces, not a new
authorization capability and not a reason to reuse the semantically unrelated
`canCreateEvents` predicate. Keep the resolver with the nav registry rather than naming it
like a Firestore permission.

**Tracker is the one asynchronous gate.** Admin and production director resolve synchronously
from auth state, but "is a PM on at least one event" has to be derived from the
`collectionGroup('members')` query the app already runs (and already discards the role from)
in `events-read.ts:47` and `tracker-service.ts:85`. Treat the unresolved state as
**not visible**, so the link never flashes in and then disappears. The production-director
tier itself is specified in
[EVENT_OVERSIGHT_ROLE_PLAN.md](EVENT_OVERSIGHT_ROLE_PLAN.md) and is a prerequisite for the
admin/director half of this row.

> **⚠ Hiding a link is not access control.** At the rules level, `contacts/{id}` and
> `artistDocuments/{id}` are both `allow read: if isActiveUser()` — *any* approved user can
> read the entire contacts directory and the whole document library, and can still reach
> `/contacts` or `/documents` by typing the URL. If non-organizers genuinely shouldn't
> *access* those, that's a security-rules change and a separate piece of work, tracked as
> [IDEAS §5](IDEAS.md). This plan only changes what the nav offers.
>
> Events and Tracker are already scoped correctly: non-admins resolve events through a
> `collectionGroup('members')` query, so both surfaces only contain assigned events.

### Grouping rationale

- **Destinations** (Events, Contacts, Documents, Tracker) — day-to-day. Tracker is a
  production-management tool: a PM sees their own events' completion, and admin/production
  director see every event. Department leads and techs don't get it at all. Contacts and
  Documents are cross-event directories, so their navigation entries follow the global
  organizer/admin presentation policy.
- **Admin** (Admin, Templates, Schedule templates) — all three sit behind `AdminGate` in
  `App.tsx`, so they share one gate and one group. Admin leads the group and keeps its
  accent styling and pending count, since that badge is a standing nudge.
- **Account** (Settings, email, Sign out) — personal, and last, matching where users
  expect account actions to live.

## Breakpoint

**800px**, expressed with Tailwind's arbitrary `min-[800px]:` variant.

The full inline row currently needs 750px, including the header padding. Switching at the
named `md:` breakpoint (768px) would leave only 18px of tolerance for font metrics, a
pending-count badge, and identity text. The originally suggested `max-w-[12rem]` email cap
would not fix that: replacing the measured 161px email with a possible 192px flex item
raises the row to roughly 781px.

At 800px, constrain the desktop email flex item with `max-w-40 truncate` (160px) and
`min-w-0`; keep the complete address as the text content so assistive technology still
receives it. The narrow-screen email label also needs `min-w-0` plus truncation or safe
wrapping so an unusually long address cannot widen the panel.

The CSS breakpoint and the JavaScript `matchMedia('(min-width: 800px)')` used to clear open
menu state must stay identical. Keep the media-query string in one named constant near the
shell implementation and cover the 799/800px boundary in tests.

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
- Brand home link: `min-h-11` below 800px even when its visible mark shrinks to 32px.
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
  `pm-or-oversight` (`isAdmin || isProductionDirector || isPmSomewhere`); `cross-event`
  (`isAdmin || isOrganizer`); or `admin`. Unit-test this matrix directly. It is a
  presentation rule, not access control. Only `pm-or-oversight` depends on an async input,
  so the resolver takes `isPmSomewhere` as an explicit tri-state (`true | false | unknown`)
  rather than reading a query itself — that keeps it pure and makes the loading policy
  testable.
- `placements` is always explicit. Events, Contacts, Documents, Admin, and Settings render
  in both presentations; Tracker, Templates, and Schedule templates render only in
  `narrow`.
- Both presentations filter and render from this one registry so labels, destinations, and
  role behavior cannot drift accidentally.

## Test impact

**Update `tests/emulator/responsive-accessibility.emulator.spec.ts`.** It currently signs in
as `PERSONAS.pm`, whose claims are `{ approved: true }` — deliberately **not** a global
organizer — and who is seeded as `production-manager` on `e2e-event-alpha`. At 390×844, open
the disclosure and assert that this persona sees Events, Tracker, and account content but not
Contacts, Documents, or admin-only links. Keep its `scrollWidth <= clientWidth` assertion.

The seeded personas already cover the whole matrix with no new fixtures — `pm` is PM on
alpha, `lead` is department-lead on alpha, `tech` is tech on alpha, `crossEvent` is PM on
beta, plus `organizer` and `admin`. A `director` persona is added by
[EVENT_OVERSIGHT_ROLE_PLAN.md](EVENT_OVERSIGHT_ROLE_PLAN.md).

Required coverage:

- Pure unit test for every `visibility` × viewer combination and for explicit placements,
  including `isPmSomewhere: unknown` resolving to hidden.
- PM narrow menu: Events + Tracker + account only.
- **Lead and tech narrow menus: Events + account only — no Tracker.** This is the assertion
  that catches the gate silently failing open.
- Organizer narrow menu: Events + Contacts + Documents + account, no admin group.
- Director narrow menu: Events + Tracker + account (Tracker via oversight, not membership).
- Admin narrow menu: every item plus the pending-approval badge.
- Menu opens/closes; outside click closes; Escape closes and restores trigger focus.
- Opening keeps trigger focus; Tab reaches the first visible link.
- Navigating, changing location search/hash, and crossing 800px all clear open state.
- Current destination exposes `aria-current="page"`, including descendant routes.
- Axe passes with the disclosure open.
- Trigger, brand link, and every interactive row measure at least 44px.
- 799px uses the disclosure and 800px uses the inline row without wrapping; a long email
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
  [IDEAS §5](IDEAS.md).
- Building the production-director tier itself (claim, rules, `listEvents`/`listVisibleEvents`
  scoping); specified in [EVENT_OVERSIGHT_ROLE_PLAN.md](EVENT_OVERSIGHT_ROLE_PLAN.md). This
  plan consumes `isProductionDirector` and does not create it.
- No change to routing, auth, or any other screen body.

## In-app links must honour the same policy

**In scope, and easy to forget.** Hiding a destination from the navigation accomplishes
nothing while another screen still links to it. Two links currently defeat the policy above:

- **`src/features/events/EventsListScreen.tsx:208`** — the Tracker link in the Events header
  is ungated, so a tech keeps a one-click route to a tracker this plan hides. Must follow the
  same `pm-or-oversight` rule. (An earlier revision of this plan waived this on the grounds
  that Tracker was visible to everyone; that reasoning no longer applies.)
- **`src/features/events/EventContactsPanel.tsx:193`** — the Crew panel's "Manage directory →"
  link renders for every event member, above the `canEdit` block, pointing at `/contacts`,
  which this plan hides from non-organizers. Must follow the same `cross-event` rule. (The
  second `/contacts` link in that file, at `:236`, already sits inside `canEdit` and is fine.)

Resolve both through the same predicates the nav registry uses, so there is one answer per
capability rather than three.
