# Admin screen — navigation proposal

**Status:** proposal, not started. Raised 2026-07-31 after a section proved hard to find in use.

## The problem, concretely

`pwa/src/features/admin/AdminScreen.tsx` is **528 lines** and renders **13 sections** in one
continuous scroll, at a single `/admin` route:

| # | Section | Where it lives |
| --- | --- | --- |
| 1 | Pending approval *(conditional)* | inline, `AdminScreen.tsx` |
| 2 | Users | inline, ~100 lines |
| 3 | Departments | `DepartmentsAdmin.tsx` (185) |
| 4 | Festivals | `FestivalsAdmin.tsx` (185) |
| 5 | Document categories | `DocumentCategoriesAdmin.tsx` (189) |
| 6 | Document library | `DocumentLibraryAdmin.tsx` (96) |
| 7 | Branding | `BrandingAdmin.tsx` (128) |
| 8 | Packet filename | `PacketNamingAdmin.tsx` (126) |
| 9 | Crew types | `CrewTypesAdmin.tsx` (92) |
| 10 | Observability | `ObservabilityDiagnostics.tsx` (59) |
| 11 | Templates | inline |
| 12 | Schedule templates | inline |
| 13 | Event membership | inline |

**Observed failure:** the owner could not find Festivals, despite the event form saying "Add
festivals in Admin → Festivals first." It renders at line 368 — below Users, Departments, and a
~100-line user table. It was never missing; it was below the fold. That is the whole case for this
change: the page is not *disorganised* so much as *unnavigable*, and the cost lands on the person
following an instruction that names the section.

## Proposal — four tabs

| Tab | Sections | Why these belong together |
| --- | --- | --- |
| **People & access** | Users, Event membership | The only two about *who* can see what. Both answer "why can't X open this show?" — today ~150 lines of unrelated config sit between them. |
| **Event setup** | Festivals, Departments, Templates, Schedule templates, Crew types | Everything consulted while standing up an event. Festivals belongs here rather than with branding: its logo is a *consequence* of the festival, not its purpose. |
| **Documents** | Document categories, Document library | Already adjacent, and genuinely one workflow. |
| **Branding & output** | Branding, Packet filename | What generated output looks like. |

### Two placements that are deliberate, not incidental

**Pending approval stays outside the tabs, always visible.** It is a conditional, urgent
call-to-action — those accounts are *blocked from the app* until someone acts. Filing it under a tab
means an admin who happens to be on "Documents" cannot see that somebody is locked out. It should
render above the tab bar, exactly as it does today, and disappear when empty.

**Observability is not a tab.** It's a diagnostic, not a setting — a link in the tab row or the page
footer. Giving it equal billing with Users overstates it.

**Crew types is the genuine judgement call.** It's schedule vocabulary, so it sits under Event setup
here, but an argument for Branding & output ("things that shape output") is not wrong. Low stakes
either way; easy to move.

## What this must not break

1. **The three in-app deep links.** `TemplateEditorScreen` → "Admin → Schedule templates",
   `DocumentsScreen` → "Admin → Document library", `EventForm` → "Admin → Festivals". Once tabbed,
   those instructions get *worse* than today unless they link to the tab
   (`/admin?tab=event-setup`) or scroll to the section. **This is the reason the change came up, so
   shipping tabs without it would miss the point.** Prefer a URL param over local state so the links
   work, the browser back button behaves, and a tab is shareable.
2. **Discoverability of the other three groups.** Tabs fix below-the-fold but make three groups
   invisible at a glance. With 13 sections that's the right trade — but it argues for tab labels
   that plainly name their contents over clever ones, and against nesting any deeper.
3. **Admin-only gating.** `/admin` is already wrapped in `AdminGate` in `App.tsx`; tabs are
   presentation only and must not introduce a second gate to keep in sync.

## Implementation sketch

- Read/write the active tab from a `?tab=` search param (`useSearchParams`), defaulting to
  People & access. No new route; `/admin` stays one lazy chunk.
- Extract the four inline sections (Users, Templates, Schedule templates, Event membership) into
  their own components, mirroring the eight that already are. That alone takes `AdminScreen.tsx`
  from 528 lines to a thin tab shell, back under the 500-line advisory limit — this refactor is
  worth doing regardless of whether tabs ship.
- Tabs need real semantics: `role="tablist"` / `role="tab"` / `aria-selected`, arrow-key movement,
  44px targets. There are a11y tests in this repo and an axe pass to satisfy.
- Update the three deep-link call sites to real links.

## Cost and sequencing

Roughly a day: mostly the mechanical extraction of four inline sections, then the tab shell, the
deep links, and tests. **Do it as its own PR** — it's a navigation change, not a fix, and it reviews
far better in isolation than bundled with feature work.

Not urgent. The cheap partial fix, if this is deferred, is simply to **reorder** the existing
sections so the ones named by in-app instructions sit near the top — that addresses the observed
failure without any structural change.

## Decisions (resolved 2026-07-31)

- **Four-way grouping stands.** Event setup keeps all five sections; Templates and Schedule
  templates are not split into a fifth tab.
- **Always default** to People & access — no per-user memory of the last tab. Predictable beats
  personalised here: an admin following "Admin → Festivals" lands somewhere they can reason about,
  and there's no stored state to explain when two people see different things. The `?tab=` param
  still makes any tab linkable and shareable.
