# Phase 8 — Advance Tracker (grid) — execution plan

The ROADMAP's §8 tracker: a **read-only roll-up** of advance progress, **colored by
per-section status** (grey → amber → green; red stays brand). Auto-filled from the section
statuses written in Phases 2/4 — **no manual re-entry, no new data shape.**

> **Status: APPROVED — decisions locked 2026-06-23.** Branch `feature/phase-8-tracker`, PR → `main`.

## Decisions (locked)
1. **Primary view:** **overview → drill-in** *(user)* — an events list with a completion
   roll-up; click an event into a grid of its **advances (rows) × departments (columns)**,
   each cell colored by that section's status. Row/cell click opens the advance.
2. **Scope:** viewer-gated — admins see all events, members see their events (reuses the
   `listEvents` model). Read-only; no writes, no new permissions.

## Data (no new Firestore shape)
Reads existing docs: `events` (viewer-scoped) · `events/{id}/stages` · `.../advances`
(`sections[deptId].status`) · `departments` (column labels) · `event.departmentIds`
(which columns). **No firestore.rules / functions / storage changes → no backend deploy**
(frontend ships with the external hosting deploy).

## Architecture
- `no-cross-feature` forbids `features/tracker` importing `features/events` services, so the
  aggregation lives in **`@/lib/tracker/`** (a shared lib doing its own Firestore IO via the
  `@/lib` models — mirrors `@/lib/rbac/membership.ts`).
- **`src/lib/tracker/tracker.ts`** — grid model types + **pure** aggregation helpers
  (`rollUpEvent`, status counts, completion %). Unit-tested.
- **`src/lib/tracker/tracker-service.ts`** — Firestore reads that assemble overview +
  per-event grid, calling the pure helpers.
- **`src/features/tracker/`** — `TrackerOverviewScreen`, `EventTrackerScreen`, `TrackerGrid`
  (+ status cell / completion bar), `index.ts` barrel.

## Workstreams
### 8.1 Tracker model + aggregation  [A]
- `tracker.ts`: `StatusCounts`, `AdvanceRow` (cells keyed by deptId → status|null),
  `EventTracker` (departments, rows, summary), `EventSummary` (counts + pct). Pure
  `rollUpEvent(advances, departmentIds, deptNames, stageNames)` + counts/pct helpers + tests.

### 8.2 Tracker service  [A]
- `tracker-service.ts`: `getEventTracker(eventId)` (stages → advances → rollUp) and
  `listEventSummaries(viewer)` (per-event completion for the overview, parallel reads).

### 8.3 UI  [A]
- Overview: cards per event (name, dates, completion bar + counts, "X advances"); empty state.
- Grid: advances × departments table, status-colored cells (reuse status tokens), stage
  grouping, horizontal scroll on mobile; cell/row → advance detail route. Back to overview.
- Wire routes `/tracker` + `/tracker/:eventId` in `App.tsx`; add **Tracker** nav in `AppShell`;
  add a "Tracker" link on the event detail header.

### 8.4 Verify + ship  [A]
- typecheck · lint · unit · arch · build green; PR; squash-merge on green CI. **No backend
  deploy** (no functions/rules). Update AGENTS canonical sources, ROADMAP decisions, memory.

## Out of scope (later)
Global all-advances grid · per-department/stage filters · gear pull-sheet (§8b) · editing
from the grid (it stays read-only).

## Exit criteria
From `/tracker`, see each event's completion; drill into an event to a status-colored
advances × departments grid; click through to an advance. CI green; merged.
