# Phase 3 — Stages, Departments & Configurable Sections (execution plan)

Re-scoped from [`BUILD_PLAN.md`](BUILD_PLAN.md) after the 2026-06-23 decisions on the
audio advance reference ([`AUDIO_ADVANCE_REFERENCE.md`](../reference/AUDIO_ADVANCE_REFERENCE.md)).
**Goal:** the structural foundation the rest of the advance work needs — a festival
holds **stages**, each stage holds **advances**, and an advance shows **one section
per the event's enabled department**, with **structured additions/concerns/pending**
fields that will roll up to the summary report. Rich per-department content is Phase 4.

> **Status: APPROVED — decisions locked 2026-06-23.** Implementation on
> `feature/phase-3-stages-departments`, PR → `main` (CI Summary gate incl. rules tests).

## Decisions (locked 2026-06-23)
1. **First-class stages:** `event → stages → advances` (festivals are multi-stage; the
   lead advances one sheet per stage; packets/pull-sheets are per-stage).
2. **Department-configurable sections:** an app-wide, admin-managed **departments**
   list; each event **enables** a subset; an advance renders **one finalize-able
   section per enabled department**. v1 = department *is* the section; rich sub-fields
   per department land in Phase 4.
3. **Initial departments** *(user)*: **Audio · Lighting · Video/LED · Logistics ·
   Labor · Artist Relations** (Artist Relations is a placeholder for now). Logistics
   absorbs the Phase 2 fixed sections (transport + schedules + documents); Labor
   absorbs crew/staff.
4. **Structured additions/concerns/pending:** dedicated advance fields (roll up to the
   summary report), not freeform flags.
5. **Gear inventory / pull-sheet: deferred** (post-MVP).
6. **Migration:** *(user)* no test events to preserve — recreate test data freely.

## Build order (confirmed 2026-06-23)
| New | Phase |
| --- | ----- |
| **3** | **Stages, Departments & configurable section framework** (this plan) |
| 4 | Advance content — **audio** sections (rich fields per the reference) + schedules/transport |
| 5 | Templates (seed stages + enabled departments + content + default roles) |
| 6 | PDF packets + summary report (MVP boundary) |
| 7+ | Tracker · quotes · contacts · portal · integrations · (gear inventory, deferred) |

## Data model
```
config/departments/{deptId}      { name, order }                          # admin-managed; seeded with the 6
events/{eventId}                 { ...Phase 2..., departmentIds: [ ... ] }# enabled departments (per-event)
events/{eventId}/members/{uid}   { role, ... }                           # per-event roles cover all stages
events/{eventId}/stages/{stageId}                { name, order, notes? }
events/{eventId}/stages/{stageId}/advances/{advanceId}
    { artistName, performanceDate?, stage?, notes?,
      additions?, concerns?, pending?,                                    # structured summary fields
      sections: { <deptId>: { status, finalizedAt, finalizedBy } } }     # one per enabled department
```
- **Sections are department-keyed.** The Phase 2 fixed `SECTION_KEYS` are replaced by
  the event's enabled `departmentIds`; the status state machine + finalize/unlock
  predicates are reused unchanged. `initialSections(departmentIds)` seeds the map.
- **Membership stays per-event** (a PM on the event covers all its stages).
- **Department enablement is per-event** in v1 (applies to all stages); per-stage
  enablement + per-department sub-sections are later refinements.

## Workstreams ([A] agent · [U] user)

### 3.1 Stages — model + CRUD + migration  [A]
- `src/lib/events/stage.ts` (shared): type + Zod + parser. `stages-service` (events
  feature): create / list / rename / reorder / delete.
- Advances move **under a stage**: `events/{id}/stages/{stageId}/advances/{advId}`;
  routes become `/events/:id/stages/:stageId/advances/:advId`. Event detail lists
  **stages**; a stage shows its advances panel (relocate the Phase 2 panel).
- **Migration:** none to preserve — recreate. (Provide a tiny default-stage seed for
  convenience when an event has no stages.)

### 3.2 Departments — config + per-event enablement  [A]
- `config/departments` collection seeded with the 6 (Audio, Lighting, Video/LED,
  Logistics, Labor, Artist Relations); admin CRUD in the `/admin` tool (name, order).
  <!-- Updated: **Staging** was added as a deliberate Phase-5 decision (ROADMAP §5),
  so the shipped seed is **7** departments — see `src/lib/departments/department.ts`. -->
- Event create/edit picks **enabled departments** (default = all 6).
- Shared `departments-service` + React Query hooks; canonical registry note in AGENTS.

### 3.3 Department-keyed sections + structured fields  [A]
- Refactor `sections.ts`: `initialSections(departmentIds)`; section keys = dept ids;
  the advance renders a section per enabled department with status + finalize/unlock.
- `createAdvance` seeds sections from the event's `departmentIds`.
- Add **additions / concerns / pending** structured fields to the advance + detail UI.

### 3.4 Security rules + rules tests  [A]
- Rules for `config/departments` (admin write; signed-in read), `events.departmentIds`
  (PM/admin update), `stages` (member read; PM/admin write), and advances **under
  stages** (same gate, deeper path). Extend `test/firestore.rules.test.ts`.

### 3.5 Verify & hand off  [A] → [U]
- typecheck · lint · unit · **rules** · arch · build green; manual pass; PR; **stop for "ship it."**

## Out of scope (later phases)
Rich per-department **content fields** (Phase 4) · templates (Phase 5) · packets +
summary report (Phase 6) · gear inventory (deferred) · per-stage roles / per-stage
department enablement / per-department sub-sections.

## Exit criteria
A festival has multiple **stages**; advances live under a stage; an event **enables
departments** and each advance shows exactly those departments as finalize-able
**sections**; **additions/concerns/pending** are structured fields; rules enforce the
deeper paths with **green rules tests**; CI green.
