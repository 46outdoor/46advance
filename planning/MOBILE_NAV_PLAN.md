# Mobile navigation — design

Graduated from [IDEAS.md §1](IDEAS.md) on 2026-08-08. Design agreed; **not yet built**.

Scope: the authenticated app header on narrow screens. Desktop layout is unchanged apart
from one stability guard (see [Breakpoint](#breakpoint)).

---

## Decisions

| Question | Decision |
| --- | --- |
| Mobile pattern | A **dropdown** behind a single trigger |
| Trigger | **Hamburger**, holding navigation *and* identity |
| Inline on mobile | **Nothing** — brand + trigger only |
| Orphan routes | **Surfaced** in the menu (Tracker, Templates, Schedule templates) |
| Breakpoint | **`md:` (768px)** — see rationale below |
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

Separately, none of the current tap targets meet the project's own 44px rule: `Sign out`
is `px-2 py-1 text-xs`, the Admin pill is `px-1.5 py-0.5 text-[0.6rem]`, and the three
text links have no padding at all.

## Layout

**Below `md:` — brand + trigger, one row.**

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

A tech or department lead — **the common case** — sees only what they need:

```
┌────────────────────────────────┐
│  Events                        │
├────────────────────────────────┤
│  Settings                      │
│  joe@46entertainment.com       │
│  Sign out                      │
└────────────────────────────────┘
```

**`md:` and up — unchanged from today**: brand, inline links, email, Sign out. The same
role rules apply to which links render.

### Role-aware contents

Most people on a show don't need the whole app. Crew are attached to an event and given
read-only access to *that* event; Tracker, Documents, and Contacts are production-management
surfaces, not crew surfaces.

| Item | Visible to |
| --- | --- |
| Events | everyone |
| Contacts, Documents, Tracker | **organizer or admin** |
| Admin, Templates, Schedule templates | **admin** |
| Settings, email, Sign out | everyone |

**Which signal gates this.** Nav is global chrome, but the PM/lead/tech roles are
**per-event** — someone can be a PM on one show and a tech on another, so there is no
global "is a PM" state to read. The right signal is the existing **global `organizer`
claim** (`users/{uid}.organizer`), already used by `canCreateEvents` (admin || organizer)
and already available in the security rules as `isOrganizer()`. Reuse it; don't invent a
second capability model.

> **⚠ Hiding a link is not access control.** At the rules level, `contacts/{id}` and
> `artistDocuments/{id}` are both `allow read: if isActiveUser()` — *any* approved user can
> read the entire contacts directory and the whole document library, and can still reach
> `/contacts` or `/documents` by typing the URL. If non-PMs genuinely shouldn't *access*
> those, that's a security-rules change and a separate piece of work, tracked as
> [IDEAS §5](IDEAS.md). This plan only changes what the nav offers.
>
> Events are the exception and are **already correct**: non-admins list events via a
> `collectionGroup('members')` query, so they only ever see events they're assigned to.

### Grouping rationale

- **Destinations** (Events, Contacts, Documents, Tracker) — day-to-day. `/tracker` is not
  admin-gated at the route level, but it is a production-management view, so it follows
  the organizer gate rather than being shown to everyone. It's currently reachable only
  via a link on the Events screen.
- **Admin** (Admin, Templates, Schedule templates) — all three sit behind `AdminGate` in
  `App.tsx`, so they share one gate and one group. Admin leads the group and keeps its
  accent styling and pending count, since that badge is a standing nudge.
- **Account** (Settings, email, Sign out) — personal, and last, matching where users
  expect account actions to live.

## Breakpoint

**`md:` (768px)**, not the codebase's usual `sm:`.

`sm:` (640px) is the house convention and was the obvious first choice, but it's wrong
here: the full inline row needs **750px**, so switching at 640px would hand the
640–749px band the exact two-row wrap this change exists to remove.

**Required guard:** the 750px figure depends on `jared@46entertainment.com` rendering at
161px. A longer address re-breaks it — roughly 30 characters needs ~780px and wraps again
at `md:`. So the desktop email span must be constrained (e.g. `max-w-[12rem] truncate`)
to cap the row's width independent of address length. This is the only desktop change in
scope.

## Interaction & accessibility

**Use a disclosure pattern, not `role="menu"`.** `role="menu"`/`menuitem` implies
application-menu semantics (arrow-key navigation, "menu" announced to screen readers) and
is meant for commands, not a list of destinations. A `<button aria-expanded aria-controls>`
toggling a `<nav>` of links is the correct shape, and Tab works naturally.

- Trigger: `<button aria-expanded aria-controls="…" aria-label="Menu">`, `min-h-11 min-w-11`.
- Panel: `<nav aria-label="Main">` wrapping a `<ul>`; every row `min-h-11`.
- **Escape** closes and returns focus to the trigger.
- **Click/tap outside** closes.
- **A route change closes it** — easy to miss, and without it the menu hangs open over the
  screen you just navigated to.
- Open moves focus into the panel.
- **No focus trap and no scroll lock.** This is a non-modal disclosure, not a dialog —
  Tab should be able to leave. (If it later becomes a full-screen sheet, `PhotoEditor.tsx`
  is the proven in-repo trap to copy: focus on open, Tab cycle, Escape, restore.)
- The header keeps its existing scroll-shrink behaviour; the trigger must stay ≥44px in
  the shrunk state.

`AdminTabBar` (`src/features/admin/AdminScreen.tsx:22-60`) is the in-repo bar for
keyboard-correct navigation UI and worth reading first.

## Enabling refactor: a nav registry

Nav links are hardcoded inline in `AppShell.tsx` today — no registry, no shared source of
truth tying a route to a label. That's precisely how Tracker and the template screens
drifted out of the nav in the first place, and a second presentation (the menu) doubles
the chance of drift.

Extract to `src/lib/nav/items.ts`, mirroring `src/lib/admin/tabs.ts` — which lives in
`lib/` specifically so any feature can reference it without violating the no-cross-feature
import rule. Roughly `{ to, label, group, visibility, inBar? }`, where `visibility` is
`'all' | 'organizer' | 'admin'`, with both the desktop row and the mobile menu rendering
from the one list.

Two flags carry real weight here:

- **`visibility`** resolves against the viewer once, so the two presentations can't drift
  into showing different things to the same person. Keep the predicate itself in
  `src/lib/rbac/permissions.ts` alongside `canCreateEvents` rather than in the nav module —
  it's a capability question, not a layout one.
- **`inBar`** keeps the desktop row from inheriting the three newly-surfaced routes, which
  would push it from 750px to roughly 1050px.

## Test impact

- **`tests/emulator/responsive-accessibility.emulator.spec.ts` will fail as written**, for
  two independent reasons. At 390×844 it asserts Events / Contacts / Documents are
  *visible*; behind a dropdown they aren't until the trigger is pressed. On top of that,
  role-aware contents mean **Contacts and Documents may not render at all** depending on
  which seeded persona the spec signs in as — check whether that persona is an organizer
  before rewriting the assertions. Its `scrollWidth <= clientWidth` assertion should stay;
  it's still the overflow guard.
- Cover both shapes of the menu — an organizer/admin seeing the full list, and a plain
  tech seeing only Events + account. The role gate is the easiest part of this to get
  silently wrong.
- Worth adding alongside: menu opens and closes, Escape restores focus to the trigger,
  navigating closes the menu, axe passes with the menu open, and the trigger and rows meet
  44px.

## Out of scope

- **Desktop still can't reach Templates or Schedule templates from the nav.** This change
  fixes the drift on mobile only. Fixing it on desktop means an overflow menu at all
  widths — a bigger question, deliberately deferred.
- **The brand lockup is duplicated in three places** (`AppShell`, `LandingScreen`,
  `PrivacyScreen`), so this change doesn't reach the signed-out screens. Unifying them is
  a separate cleanup.
- No change to routing, auth, or any screen body.
