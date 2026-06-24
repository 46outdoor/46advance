# Phase 10 — Contacts Manager — execution plan

ROADMAP §11: a reusable **personnel directory** (distinct from RBAC users) — maintain people
once, **attach them per event by role** so techs can reach the right people, and as event
records. Mobile tap-to-call/email.

> **Status: APPROVED — decisions locked 2026-06-24.** Branch `feature/phase-10-contacts`, PR → `main`.

## Decisions (locked / sensible defaults)
1. **Global directory + per-event attachment** *(roadmap-decided)*.
2. **Fields:** name, role/title, company, phone, email, notes.
3. **Directory writes (default):** any signed-in team member may **create** a contact
   (createdBy == self); **edit/delete** limited to admin or the creator. Internal tool, low
   stakes — the whole team builds the directory; nobody clobbers others' entries.
4. **Per-event attach:** PM/admin (`canEditEvent`) attach/detach; members read. An attachment
   carries a free-text **role-on-this-event** label; contact details resolve from the global
   directory (single source of truth — edits propagate).
5. **User-account link:** **deferred** (TBD in roadmap) — not modeled yet.

## Data model (new)
- `contacts/{contactId}` — `{ name, role, company, phone, email, notes, createdBy, createdAt, updatedAt }`.
- `events/{eventId}/contacts/{attachId}` — `{ contactId, roleLabel, addedBy, addedAt }` (join doc).

## Architecture
- `src/lib/contacts/contact.ts` — model + Zod + parser + input schema + `tel:`/`mailto:` helpers. Unit-tested.
- `src/lib/contacts/contacts-service.ts` — **global directory** CRUD (shared lib so both the
  contacts feature and the events feature use it — no-cross-feature).
- `src/features/contacts/` — `ContactsDirectoryScreen` + `ContactForm` (manage the directory).
- `src/features/events/event-contacts-service.ts` — attach/detach/list event contacts (resolves
  via the directory) — co-located with events.
- `src/features/events/EventContactsPanel.tsx` — on the event detail: attached contacts with
  tap-to-call/email + role label; attach-from-directory picker; detach.

## Rules (+ tests)
- `contacts/{id}`: read = signed-in; create = signed-in & createdBy==uid; update/delete =
  admin || creator.
- `events/{eventId}/contacts/{attachId}`: member read; PM/admin write.
- Rules tests cover both (read/create/update/delete by role; creator-only edit).

## Workstreams
- **10.1** contact model + helpers (+ tests).  **10.2** directory service (lib).
- **10.3** directory UI (`/contacts` screen + form; nav link).  **10.4** event-attach service + panel.
- **10.5** rules + rules tests.  **10.6** verify (typecheck/lint/unit/rules/arch/build) → PR →
  merge on green CI → **deploy firestore:rules** (no functions this phase). Update AGENTS/ROADMAP/memory.

## Out of scope (later)
Linking a contact to a user account · contact groups/tags · import from CSV/Google · per-event
contact roles tied to the department list (free-text label for now).

## Exit criteria
Maintain a global contact; attach it to an event with a role; a tech opens the event and taps
to call/email. Rules enforce creator-only edits + PM/admin attachment. CI green; rules deployed.
