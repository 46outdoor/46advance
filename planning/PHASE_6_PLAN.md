# Phase 6 — Templates (execution plan)

From the re-scoped build order (now **after** Phase 5 — the event production record).
**Goal:** spin up a new festival fast — a **named template** seeds a new event's
**enabled departments + stages + default section content + the event production record
defaults + default member/role list**, then a PM adjusts per event. Most production is
standard (ROADMAP §6 / the audio reference); the advance only captures per-artist
exceptions.

> **Status: APPROVED (template decisions) — but now sequenced as Phase 6**, after the
> Phase 5 production record (so templates seed production defaults too). Implementation on
> `feature/phase-6-templates`, PR → `main`. Downstream: PDF packets become Phase 7.

## Builds on
Phases 2–4: events → stages → advances; per-event `departmentIds`; `advance.content`
(department field registry); per-event membership. A template is a reusable blueprint
for all of that.

## Decisions (locked 2026-06-23)
1. **What a template seeds:** **full blueprint** *(user)* — departments + stages + default
   section content + default member/role list.
2. **Default content propagation:** **copy-on-create** *(user)* — template defaults copy to
   `event.defaults[deptId]`, and each new advance copies them into `advance.content`; the PM
   edits per artist. Edits do **not** retro-propagate to existing advances.
3. **Create-from-template mechanism:** **Cloud Function `createEventFromTemplate`** *(user)*
   (admin|organizer) — seeds event + stages + members + defaults server-side (Admin SDK), so
   an organizer can create a fully-seeded event incl. the roster, atomically.
4. **Template editing → existing events:** new events only (no retroactive change).
5. **Field definitions / form-builder:** out of scope; field *definitions* stay code-defined
   (Phase 4 registry). Templates seed field **values** (defaults), not new field types.
6. **Who manages templates:** admin-only CRUD (app-wide config, like departments).

## Data model (proposed)
```
templates/{templateId}
  { name,
    departmentIds: [ ... ],
    stages: [ { name, order }, ... ],
    defaults: { <deptId>: { <fieldKey>: value } },   # standard-package content
    members: [ { uid, role }, ... ],                 # default role list
    createdBy, createdAt, updatedAt }

events/{eventId}  { ...Phase 2–3..., templateId?, defaults?: { <deptId>: { <fieldKey>: value } } }
events/{eventId}/stages/{stageId}/advances/{advId}  { ..., content seeded from event.defaults }
```

## Workstreams ([A] agent · [U] user)

### 5.1 Template model + admin editor  [A] + [U]
- `lib/templates/template.ts` (type + Zod + parser); `templates-service` (admin CRUD).
- Admin **template editor** (in `/admin` or its own admin route): name · enabled
  departments · stages list · **default section content per department** (reuse the
  Phase 4 `SectionContentForm`/registry) · default member/role list (reuse the membership
  primitive).
- **[U]** provide a first real template (departments, stages, standard Audio defaults).

### 5.2 Create-from-template  [A]
- Cloud Function `createEventFromTemplate(templateId, eventInput)` (admin|organizer):
  creates the event (createdBy = caller), seeds stages + members + `event.defaults`,
  and adds the caller as PM. Returns the new event id.
- Event create UI gains a **"From template"** picker (falls back to the blank create).

### 5.3 Defaults → advances  [A]
- `createAdvance` copies `event.defaults[deptId]` into `advance.content[deptId]` (new
  advances start pre-filled with the standard package; sections still start not_started).

### 5.4 Security rules + rules tests  [A]
- `templates/{id}`: signed-in read (or admin-only read?), admin write. The
  `createEventFromTemplate` function runs with Admin SDK (bypasses rules) but validates
  caller is admin|organizer. Extend rules tests.

### 5.5 Verify & hand off  [A] → [U]
- typecheck · lint · unit · rules · arch · build green; manual pass (build a template →
  create event from it → advances pre-filled); PR; **stop for "ship it."**

## Out of scope (later phases)
Form-builder / admin-editable field *definitions* · schedules + master schedule · retro
template propagation · PDF packets + summary report (Phase 6) · gear inventory (deferred).

## [U] checklist
- Confirm the **Decisions** (esp. propagation model + create mechanism).
- Provide a **first template** (departments, stages, standard Audio defaults, default roles).

## Exit criteria
An admin builds a named template (departments + stages + default Audio content + default
roles); an admin **or organizer** creates an event **from the template** and gets a
fully-seeded event whose new advances start pre-filled with the standard package; rules +
tests green; CI green.
