# Phase 2 — Events, Advances & Sections (execution plan)

From [`BUILD_PLAN.md`](BUILD_PLAN.md) Phase 2. **Goal:** the core data model + CRUD —
an **event/festival holds many advances (one per artist/performance)**; each advance is
a **sectioned record** whose sections carry a **status (not started → in progress →
complete)** with a per-section **Finalize/lock**. All reads/writes are **permission-gated
by the per-event role** from Phase 1 and **proven by rules tests**. This is the spine the
rest of the app hangs on (templates, content, tracker, packets).

> **Status: APPROVED — decisions locked 2026-06-21; in progress.** Implementation runs on
> branch `feature/phase-2-events-advances`, PR → `main` (CI Summary gate, incl. rules tests).

## Builds on Phase 1
- RBAC predicates in `src/lib/rbac/` (`canViewEvent` / `canEditEvent` / `canFlag` /
  `canManageMembers`) — Phase 2 **uses** these, doesn't redefine them.
- `firestore.rules` already gate `events/{eventId}` (read: admin|member; create/delete:
  admin; update: PM|admin) and the `members` subcollection. Phase 2 **extends** these down
  to `advances` and section writes, and adds matching rules tests.
- The `/admin` membership tool seeds who-can-touch-which-event; Phase 2 gives those events
  real content.

## Decisions (locked 2026-06-21)

1. **Event creators:** **admin + global "organizer" capability** *(confirmed by user)*.
   Per-event roles can't gate creation of a not-yet-existent event, so creation is
   authorized by a **global `organizer` custom claim** (admin-grantable, like `admin`).
   Organizers + admin can create events; on create the creator is **auto-added as that
   event's production-manager**. A new admin-only callable `setUserOrganizer` sets the
   claim (+ mirrors `users/{uid}.organizer`); the admin tool gets an organizer toggle.
2. **Section storage shape:** section status/metadata **embedded on the advance doc**
   (`advance.sections.{key} = { status, finalizedAt, finalizedBy }`); rich section
   **content** arrives in Phase 4. Keeps the tracker's one-read-per-advance cheap.
3. **Advance identity:** one advance **per artist/performance**; `artistName` + optional
   `performanceDate`/`stage`. Multiple performances by one artist = multiple advances
   (no hard uniqueness constraint in v1).
4. **Unlock policy:** **admin + production-manager may unlock** a finalized section
   (records `finalizedBy`/audit); department-lead/tech cannot. *(Confirmed by user.)*
5. **Standard section set (v1):** `transportation`, `production-schedule`,
   `show-schedule`, `travel-schedule`, `labor-schedule`. Custom schedule sections are
   **Phase 4**. (These are *slots* now; fields land in Phase 4.)
6. **CRUD transport:** **client-side writes gated by rules + Zod validation** for
   event/advance CRUD; **callables reserved** for cross-cutting ops (template seeding in
   Phase 3). Keeps Phase 2 lean and mobile-shareable via the same contracts.
7. **Departments** (ROADMAP §4 app-wide list): **out of scope for Phase 2**; introduce the
   `config/departments` admin list in Phase 4 when sections become department-aware.

## Ownership legend
- **[A]** agent (in-repo) · **[U]** user (console / decisions / values)

## Data model
```
events/{eventId}                      { name, startDate, endDate, venue?, status:'draft'|'active'|'archived',
                                        createdBy, createdAt, updatedAt }      # extends the Phase 1 stub
events/{eventId}/members/{uid}        { role, addedBy, addedAt }              # Phase 1 (unchanged)
events/{eventId}/advances/{advanceId} { artistName, performanceDate?, stage?, notes?,
                                        sections: { <key>: { status, finalizedAt, finalizedBy } },
                                        createdBy, createdAt, updatedAt }
```
- **Section status** = `'not_started' | 'in_progress' | 'complete'` (canonical enum in
  `src/lib/rbac/` neighbours → a new `src/lib/advances/` shared lib; tracker + packets read it).
- **Finalize** sets a section `complete` + stamps `finalizedAt`/`finalizedBy` (= lock).
  **Unlock** returns it to `in_progress` (admin/PM only). Red is never a status (brand only).

## Workstreams

### 2.1 Domain model, schemas & section state machine  [A]
- Types + **Zod schemas** for `Event`, `Advance`, `SectionStatus`, `AdvanceSections`
  (`src/types/` for types; `pwa/contracts/schemas/` for shared/backend contracts;
  parsers convert Firestore Timestamps like `parseEventMember`).
- Canonical **section state machine** in `src/lib/advances/sections.ts`: the section-key
  list, allowed transitions (`not_started→in_progress→complete`, unlock
  `complete→in_progress`), and predicates `canFinalizeSection` / `canUnlockSection`
  (composed from the Phase 1 RBAC predicates — single source of truth).
- **MPA adapt:** advance/event data model + status conventions.

### 2.2 Events — CRUD + list/filter  [A]
- `src/features/events/`: data service (create/read/update/archive), React Query hooks,
  and screens — **event list** (only events the viewer can see), **create event**
  (admin/PM per decision 1), **event detail** (header + advances list + membership link).
- List filter by `status` + text; empty/loading/error states; brand styling (dark chrome).
- **MPA adapt:** events module, event-form, list/filter, React Query patterns.
- **Mobile:** list + detail are read-priority on mobile; share the service/contracts.

### 2.3 Advances — CRUD + detail  [A]
- `src/features/advances/`: create/edit/delete advances **within an event**; advance list
  on the event page; **advance detail** rendering the section slots with status badges.
- New advances initialize every standard section to `not_started`.
- Permission-gated: view (member), edit (PM/admin); tech read-only, dept-lead read (v1).
- **MPA adapt:** advances module, artist-record form.
- **Mobile:** field entry/update of advances is high-value — design responsive forms.

### 2.4 Section status + Finalize/lock  [A]
- Per-section **status badge** (neutral/amber/green) + **Finalize** (→ complete/lock) and
  **Unlock** (admin/PM) controls on the advance detail; optimistic update + audit stamp.
- Auto `in_progress` transition hook is **stubbed** now (no rich content yet) and wired in
  Phase 4 when sections gain data; Phase 2 supports explicit status + finalize/unlock.
- **MPA adapt:** finalize/lock + status-roll-up conventions (feeds the Phase 6 tracker).

### 2.5 Security rules + rules tests  [A]
- Extend `firestore.rules`: `events` create→admin|PM (decision 1); `advances` read (member),
  create/update/delete (PM|admin); **section-status transition guards** (only PM/admin set
  `complete`; only PM/admin revert `complete`); shape validation (status ∈ enum).
- **Rules tests** (extend `test/firestore.rules.test.ts`): PM creates event+advance and
  finalizes a section; tech is read-only and **cannot** finalize; dept-lead read-only;
  non-member denied; unlock allowed only for PM/admin. Keep the CI `rules-tests` job green.
- **MPA adapt:** security-rules + rules-test patterns.

### 2.6 Verify & hand off  [A] → [U]
- `typecheck` + `lint` + `test` + **`test:rules`** + `arch:check` + `build` green; manual
  pass against emulators (create event → add advance → edit section → finalize → unlock);
  commit on branch; PR; **stop for "ship it."**

## Out of scope (later phases)
Template seeding of content + roles (Phase 3) · rich section **content** — transportation
fields + schedules/master schedule (Phase 4) · departments config + department-scoped
sections (Phase 4) · PDF packets (Phase 5) · the tracker grid (Phase 6) · custom schedule
sections · dept-lead **write** scopes.

## [U] checklist
- Decisions locked (above) — no further confirmations needed to start.
- No new console/provider setup expected (uses existing `advancethat` Firestore + rules deploy at hand-off).

## Exit criteria
A production manager (or admin) creates a festival, adds artist advances, edits sections,
and drives section status **not started → in progress → complete (finalize/lock)** with
**unlock** working per policy — all enforced by `firestore.rules` with **green rules tests**
for the per-event scenarios, and CI green.
