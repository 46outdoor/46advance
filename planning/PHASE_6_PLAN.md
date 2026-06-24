# Phase 6 — Templates (execution plan)

Spin up a new festival fast: a **named template** is an admin-authored blueprint that, on
**create-from-template**, clones a full event setup — **enabled departments + stages +
event production record + per-stage production (house package) + default roles** — leaving
**Artist Advances empty** (filled per artist as exceptions to the house package).

> **Status: APPROVED — decisions locked 2026-06-23/24.** Large phase; built in slices.
> Branch `feature/phase-6-templates` (may split 6a editor / 6b clone). PR → `main`.

## Decisions (locked)
1. **Authoring:** **dedicated admin template editor** *(user)* — author template fields
   directly (reusing the production/section/stage editors), not a snapshot-of-event.
2. **Clone scope:** **full blueprint, advances empty** *(user)* — departments + stages +
   event production + per-stage production + default roles; new Artist Advances start empty.
3. **Mechanism:** **`createEventFromTemplate` Cloud Function** (admin|organizer) — clones
   everything server-side (Admin SDK), incl. the member roster, atomically; caller added as PM.
4. **Edits → new events only** (no retro-propagation). **Admin-managed** templates.
5. **Field definitions stay code-defined** (Phase 4 registry); templates store field
   **values**, not new field types.

## Data model
```
templates/{templateId}
  { name,
    departmentIds: [ ... ],
    stages: [ { id, name, order } ],                 # template-stage ids are local/stable
    eventProduction: { info: {<fieldKey>: value}, contacts: [...], links: [...] },
    stageProduction: { <templateStageId>: { content: { <deptId>: {<fieldKey>: value} } } },
    members: [ { uid, role } ],
    createdBy, createdAt, updatedAt }
```
On clone → real `events/{id}` (+ departmentIds), `members`, `events/{id}/production/record`,
and for each template stage a real `stages/{newId}` + its `production/record`; map
templateStageId → newStageId when writing stage production. No advances created.

## Workstreams ([A] agent · [U] user)

### 6.1 Template model + service  [A]
- `src/lib/templates/template.ts` (type + Zod + parser); `templates-service` (admin CRUD).

### 6.2 Template editor (admin)  [A]
- Admin route/section: name · enabled departments (checkboxes) · stages list (add/rename/
  reorder) · **default roles** (reuse the membership primitive) · **event production
  defaults** (reuse `SectionContentForm` w/ `EVENT_PRODUCTION_FIELDS` + contacts/links
  editors) · **per-stage production defaults** (reuse `SectionContentForm`, production
  context, per enabled department).

### 6.3 createEventFromTemplate function  [A]
- Callable (admin|organizer): validate caller; clone event + members (+ caller as PM) +
  event production + stages + per-stage production; return new event id. Advances empty.

### 6.4 Create-from-template UI + rules + tests  [A]
- Event create gains a **"From template"** picker → calls the function.
- `firestore.rules`: `templates/{id}` signed-in read, admin write. Rules/clone tests.

### 6.5 Verify & hand off  [A] → [U]
- typecheck · lint · unit · rules · arch · build green; manual pass (author a template →
  create event from it → structure + production seeded, advances empty); PR; deploy
  (functions + rules); **stop for "ship it."**

## Out of scope
PDF packets (Phase 7) · gear inventory (deferred) · schedules/master schedule · retro
template propagation · admin-editable field definitions (form-builder).

## Exit criteria
An admin authors a template (departments + stages + event/stage production defaults +
roles); an admin or organizer creates an event **from the template** and gets a fully-seeded
event (structure + production records + roles, advances empty); rules + tests green; CI green.
