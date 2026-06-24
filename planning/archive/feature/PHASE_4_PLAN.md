# Phase 4 — Advance Content: Audio Section (execution plan)

From the re-scoped build order ([`PHASE_3_PLAN.md`](PHASE_3_PLAN.md) → Phase 4) and the
audio lead's reference ([`AUDIO_ADVANCE_REFERENCE.md`](../reference/AUDIO_ADVANCE_REFERENCE.md)).
**Goal:** give a department section real **content fields** — starting with **Audio**
— so a PM can actually fill an advance, with the section status moving to **in
progress** automatically as data is entered and **locking** on finalize. Other
departments reuse the same framework in later phases.

> **Status: APPROVED — decisions locked 2026-06-23.** Implementation on
> `feature/phase-4-advance-content`, PR → `main`. (Audio field list still to be
> confirmed with the user during 4.2.)

## What this builds on
Phase 3 gave each advance **one section per enabled department** (`advance.sections[deptId]`
with status + finalize/unlock). Phase 4 adds the **content inside** a section.

## Decisions (locked 2026-06-23)
1. **Content storage:** embedded on the advance doc — `advance.content[deptId] = { <fieldKey>: value }`.
2. **Field definitions:** **code-defined field registry per department** *(user)*; Audio
   first. Admin-editable field sets (form-builder) come with templates (Phase 5).
3. **Phase 4 scope:** **Audio only** *(user)* — the framework + the Audio field set.
   Other departments reuse the framework in later content phases.
4. **Schedules:** dedicated later phase (master schedule is its own feature). Phase 4 does
   not build schedules.
5. **Lock enforcement:** finalized (`complete`) sections are read-only in the UI (unlock to
   edit). Field-level lock in rules is deferred (writes already require PM/admin).

## Data model (proposed)
```
events/{id}/stages/{stageId}/advances/{advanceId}
  { ...Phase 3...,
    sections: { <deptId>: { status, finalizedAt, finalizedBy } },   # Phase 3
    content:  { <deptId>: { <fieldKey>: string | number | boolean } } }  # Phase 4
```
- **Field registry** (`src/lib/advances/fields/`): per-department typed field lists.
  Audio (from the reference): FOH console · MON console · playback · other tech worlds ·
  power needs · snake · sub snakes · sub-snake boxes · patch notes · mics & DIs · stands
  & XLR · MON needs · RF · IEM · COM · documents received (rider/stage plot/input list).
  Field types: `text` · `longtext` · `number` · `boolean` · `select`.
- **Validation**: a Zod schema derived from the registry validates `content[deptId]`.

## Workstreams ([A] agent · [U] user)

### 4.1 Content framework + generic section editor  [A]
- Field registry types + a `DEPARTMENT_FIELDS` map (Audio populated; others empty for now).
- `advance.content` on the model + parser + Zod; `advances-service.updateSectionContent(...)`.
- A generic, registry-driven **section content form** (renders fields by type) used on the
  advance/section view; gated by `canEditEvent`.

### 4.2 Audio field set  [A] + [U]
- Encode the Audio fields from the reference (grouped/ordered).
- **[U]** confirm the Audio field list/labels (refine against the lead's real usage).

### 4.3 Auto status + lock  [A]
- Auto-advance a section `not_started → in_progress` when its content first gains data
  (the hook stubbed in Phase 2).
- Finalized sections render read-only (unlock to edit). Reuse finalize/unlock from Phase 3.

### 4.4 Rules + tests  [A]
- Content writes ride the existing advance-update gate (PM/admin). Add unit tests for the
  registry/validation + a rules test that content edits follow the same gate.

### 4.5 Verify & hand off  [A] → [U]
- typecheck · lint · unit · rules · arch · build green; manual pass (fill an Audio section,
  watch status + lock); PR; **stop for "ship it."**

## Out of scope (later phases)
Other departments' field sets · schedules + master schedule (dedicated phase) · templates
+ admin-editable field sets (Phase 5) · packets/summary report (Phase 6) · gear inventory
(deferred).

## [U] checklist
- Confirm the **Decisions** (esp. scope = Audio only, schedules deferred).
- Provide/most-confirm the **Audio field list** (4.2).

## Exit criteria
A PM opens an advance's **Audio** section, fills real fields, the section flips to **in
progress**, and **Finalize** locks it (Unlock re-opens). Values persist + validate; rules
enforce PM/admin writes; CI green.
