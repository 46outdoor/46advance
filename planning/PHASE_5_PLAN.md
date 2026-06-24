# Phase 5 — Festival Production Record (event + stage) + Attachments

The festival's own **production advance** — the artist-facing packet (see
[`PRODUCTION_ADVANCE_REFERENCE.md`](PRODUCTION_ADVANCE_REFERENCE.md)) — distinct from
per-artist advances. **Goal:** capture the festival's **event-level general/policy/contact
info** + **per-stage technical house package** (staging, audio, lighting, LED/video), with
**file attachments** (stage plots, CAD, site maps). This becomes the source for the PDF
packet (Phase 7) and is seeded by templates (Phase 6).

> **Status: APPROVED — decisions locked 2026-06-23.** Split into **5a** (Staging dept +
> production records + field registries + UI) and **5b** (attachments/Storage), separate
> PRs. Branch `feature/phase-5a-production-record` first.

> **Audience — internal/tech-facing.** Borrow the 46 packet *styling*, but gear content to
> **techs working the event**, not artists (see memory `audience-internal-tech`). The
> event-level record holds **tech-operational** info (site access, schedule, power, comms,
> crew catering/parking, contacts) — **not** artist policy (hospitality riders, comps,
> settlement, merch). Per-stage technical + per-artist advance content are already tech-focused.

## Decisions (locked 2026-06-23)
1. **Two levels** *(user)*: an **event-level** production record (general/policy/contacts)
   **and** a **per-stage** production record (technical house package).
2. **New "Staging" department** *(user)*: departments become Audio · Lighting · Video/LED ·
   **Staging** · Logistics · Labor · Artist Relations.
3. **File uploads now** *(user)*: Firebase Storage attachments (plots/CAD/maps) on the
   production records, plus external-link fields. Storage rules + upload UI in this phase.
4. **Reuse the content machinery**: stage-level production reuses the department →
   section → content-field model with a **`production` context** in the field registry
   (house-package fields ≠ per-artist advance fields). Event-level uses its own field set.
5. **Production = packet source**: these fields drive the §7 PDF; values are mostly the
   standard package → strong template (Phase 6) defaults.

## Data model (proposed)
```
departments/{deptId}                       # + 'staging'
events/{id}/production/record              # event-level: tech-operational info + contacts + links + attachments
  { info: { site_access, production_schedule, site_power, comms_rf, crew_catering,
            crew_parking, production_office, crew_credentials, notes },   # tech-operational (not artist policy)
    contacts: [ { role, name, phone, email } ],
    links: [ { label, url } ],             # CAD/Drive
    attachments: [ { name, path, contentType, uploadedBy, uploadedAt } ] }   # Storage (5b)
events/{id}/stages/{sid}/production/record # per-stage technical (department-keyed, production context)
  { sections: { <deptId>: { status, finalizedAt, finalizedBy } },
    content:  { <deptId>: { <fieldKey>: value } },
    links: [...], attachments: [...] }
```
- **Field registries** (`fields.ts`, `production` context): event-level field set (policy
  longtext + contacts) and per-stage department field sets — Staging (deck/wings/towers/
  FOH deck/rigging), Audio (PA/consoles/MON/mics/stage power/intercom/staff), Lighting
  (fixtures/spots/hazers/console/plot), Video/LED (walls/switcher/router/cameras/lenses).
  Starter sets from the reference; refine with the leads.
- **Storage:** files at `events/{id}/production/...`; metadata in the `attachments` arrays.

## Workstreams ([A] agent · [U] user)

### 5.1 Staging department + production field registry  [A]
- Add `staging` to `DEFAULT_DEPARTMENTS`; `getDepartmentFields(deptId, context)` gains a
  `production` context; encode the event-level + per-stage production field sets.

### 5.2 Event-level production record  [A]
- Model + service (`events/{id}/production/record`); an event **Production** view/tab on the
  event detail: policy fields + contacts list + links. Gated by `canEditEvent`.

### 5.3 Stage-level production record  [A]
- Model + service; a stage **Production** section on the stage detail reusing the
  section/content components (production context) per the event's enabled departments,
  with status + finalize/unlock.

### 5.4 Attachments (Firebase Storage)  [A] + [U]
- Upload service + `attachments`/`links` UI on both production records (stage plots, CAD,
  site maps). `storage.rules`: member read, PM/admin write, scoped to the event.
- **Upload limits (locked):** PDF · PNG/JPG · CAD (DWG/DXF); **25 MB** max.

### 5.5 Security rules + tests  [A]
- `firestore.rules` for `production/record` docs (member read; PM/admin write) at event +
  stage level; `storage.rules` for attachments. Extend rules tests.

### 5.6 Verify & hand off  [A] → [U]
- typecheck · lint · unit · rules · arch · build green; manual pass (fill event + stage
  production, upload a plot); PR; deploy (rules + storage rules); **stop for "ship it."**

## Delivery note
Given the size, this can ship as **5a** (Staging dept + production records + field
registries + UI) then **5b** (attachments/Storage). The user chose "uploads now," so the
default is one phase built incrementally; we can split if the PR gets too large.

## Out of scope (later phases)
Templates seeding the production record (Phase 6) · PDF packet generation (Phase 7) ·
per-artist advance attachments (unless trivial) · gear inventory (deferred).

## Exit criteria
An event has a production record (general/policy/contacts) and each stage has a technical
production record (staging/audio/lighting/LED-video) with status + finalize; plots/CAD can
be **attached** (Storage) or linked; rules + storage rules enforce PM/admin writes with
green tests; CI green.
