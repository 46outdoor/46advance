# Crew travel & lodging — plan

**Status:** planned, not started. Scoped 2026-08-20 from [`IDEAS.md`](IDEAS.md) §3 (raised
2026-08-08), whose grounding was re-verified against the codebase the same day before scoping.
**Ships in two phases** that are independently valuable and independently verifiable.

Graduates IDEAS §3. That entry stays as the origin record; **this file is now the source of
truth** for the design. Decisions below were made by the user on 2026-08-20 and are binding —
ROADMAP-grade, not candidates.

---

## 1. Why this is a new shape, not a new field set

The app has two established shapes for information, and per-person logistics fits neither:

1. **Fields on a record** (production info, advance content) — flat scalars, one value per key.
   A rooming list cannot live here; only a prose blob.
2. **Time-anchored schedule rows** — right for "the bus leaves at 6", wrong for "Joe is at the
   Hampton Thu–Sun in room 412".

Per-person lodging and travel is a **third shape**: a record attached to a *person*, spanning
*dates*. That is the whole reason this is a plan rather than an append to
`src/lib/advances/fields.ts`.

Concretely, the schedule grid **cannot** carry it even if we wanted it to: `ScheduleItem.fields`
is typed `Record<string, string>` (`src/lib/schedules/scheduleDay.ts:57`) — strings only, no
dates, no numbers, no nesting — and the editor prunes any key the item type does not declare.

## 2. Decisions (locked 2026-08-20)

| # | Decision | Chosen |
| --- | --- | --- |
| 1 | Who sees itineraries | **PMs see all; each person sees only their own** |
| 2 | Population | **46 Entertainment crew only** |
| 3 | Lodging model | **Flat per-person records** |
| 4 | v1 scope | **Lodging + per-person travel** |
| 5 | Existing schedule travel rows | **Keep both — different subjects** |
| 6 | PDF packet | **No — in-app only** |
| 7 | Calendar subscription feed | **Not in v1** |
| 8 | UI location | **Its own Travel & Lodging panel** |
| 9 | Write access | **PMs, plus a new Production Coordinator** |
| 10 | Coordinator shape | **Company-wide capability**, not a per-event role |
| 11 | Coordinator writes | travel/lodging · crew roster · contacts directory · schedule days |

**These interlock — do not change one in isolation.** Decisions 6 and 7 are what make decision 1
real: the packet is generated server-side and downloaded through a member-gated URL, so printing
rooming lists would expose every itinerary to any event member regardless of the Firestore rules.
The calendar feed is event-scoped (`pushToCalendar` is global to everyone subscribed), so feeding
it would do the same. **Both leak paths are closed by scope, not by rules.** Reopening either
reopens the privacy question.

Decisions 2 and 3 also interlock: flat per-person records cannot express a room block with
unassigned slots, which is exactly why unnamed labor blocks were excluded. **Adding blocks later
is a model change, not a field addition.**

## 3. What "each person sees only their own" rests on

IDEAS §3 treated this as needing a new identity join. **It does not** — verified 2026-08-20:

`linkOrCreateContact` (`functions/src/index.ts:149-200`) runs on sign-in and guarantees every
account has exactly one linked contact — an admin-pre-added contact matched by email, or a
self-mirror created at `contacts/{uid}`. `setUserDisplayName` keeps the name in sync
(`index.ts:442`); `deleteUser` unlinks it (`index.ts:506`). So `contact.userId` resolves an
account to its person and back, today, automatically.

> **Doc-accuracy consequence:** ROADMAP §11 still says "User-account link deferred". That is
> stale — the link exists and is maintained server-side. Fix when this lands.

**The protection is narrower than it sounds, and that is accepted.** Every event member already
reads the full crew roster — names, phones, emails — via `canReadEvent`, and that does not
change. This protects room numbers and confirmation codes, not contact details.

**It also only works for crew who sign in.** A contact with no account has `userId == null`, so
their records are visible to PMs and the coordinator only. That is correct behavior, not a gap.

## 4. Phase 1 — Travel & Lodging (PM writes only)

Ships complete and useful with no RBAC change. Phase 2 widens who can write.

### 4.1 Data model

One subcollection with a discriminated union, **not** two collections: the privacy
denormalization, the rules block, and the panel's query all want to exist once.

```
events/{eventId}/crewLogistics/{recordId}
  kind        'lodging' | 'travel'
  contactId   string            // the crew member (contacts/{id})
  userId      string | null     // DENORMALIZED from contact.userId — see 4.2
  notes       string | null
  createdBy / createdAt / updatedAt

  kind === 'lodging'
    hotelName · address · hotelPhone · confirmation
    checkIn: Date · checkOut: Date
    roomType · roomNumber

  kind === 'travel'
    mode: 'flight' | 'drive' | 'train' | 'other'
    carrier · confirmation · from · to
    departAt: Date | null · arriveAt: Date | null
```

Model + Zod in `src/lib/logistics/crewLogistics.ts` (`z.discriminatedUnion` on `kind`); IO in
`src/features/events/crew-logistics-service.ts`. Dates are real `Timestamp`s, converted via
`src/lib/firestore/timestamps.ts` — **not** strings, so a stay can span days and could feed the
calendar later if decision 7 is ever revisited.

`roomNumber` is deliberately separate from `roomType` so a rooming list can be handed to a
vendor without exposing which room is whose.

### 4.2 The denormalized `userId` — and why

The read rule must answer "is this record mine?". Rules cannot join, and a `get()` on the
contact would charge a document read **per record evaluated**. So `userId` is copied onto the
record at write time. Precedent: event member docs already carry denormalized `email` /
`displayName`.

**The cost of denormalizing is staleness, and it has two known sources — both must be handled:**

- `deleteUser` (`functions/src/index.ts:506`) sets `contact.userId = null`. It must also clear
  `userId` on that person's `crewLogistics` records, or a deleted account's uid keeps matching.
- `linkOrCreateContact` links a *pre-added* contact to an account on first sign-in. Records
  created against that contact **before** the person ever signed in will have `userId == null`
  and will not become visible to them on sign-in unless backfilled. Backfill in the same
  transaction that sets `contact.userId`.

### 4.3 Rules

```
match /events/{eventId}/crewLogistics/{recordId} {
  allow read:  if canEditEvent(eventId)
                  || isCoordinator()                       // phase 2
                  || resource.data.userId == request.auth.uid;
  allow write: if canEditEvent(eventId) || isCoordinator(); // phase 2
}
```

**⚠ The list-query trap — this is the one thing most likely to ship broken.** Firestore evaluates
`list` against the *query*, not the returned documents. A crew member issuing an unconstrained
`collection(...)` read is **denied**, even though every document they would receive is one they
may read. The client must issue `where('userId','==',uid)` for non-PMs, and PMs the unconstrained
query.

This is the exact failure mode of the 2026-08-10 slug bug — a list query denied for members while
every test signed in as admin. **Non-negotiable: the emulator test for this panel signs in as a
tech, not an admin.**

### 4.4 UI

New `TravelLodgingPanel` on the event page (`src/features/events/`), rendering as its own panel
per decision 8.

- **PM / coordinator view:** every crew member's records, grouped by person, with add/edit/delete.
- **Crew view:** their own records only — read-only, and the panel hides entirely when they have
  none rather than rendering an empty shell.
- Gate the PM affordances on a new predicate, per 4.6.

### 4.5 Explicitly NOT built in phase 1

Room blocks / unassigned slots · vendor crews · artist parties · per-diem or any money ·
packet output · calendar feed · cross-event ("where is Joe this season") views · changes to the
`travel` / `transportation` schedule item types, which stay exactly as they are per decision 5.

### 4.6 Naming discipline (carried from the production-director work)

Predicates are named for the **capability**, never the holder:
`canManageCrewLogistics(viewer, role)` in `src/lib/rbac/permissions.ts` — **not**
`isCoordinator`. In phase 1 only admin and PM satisfy it. Phase 2 then widens **one predicate**
instead of sweeping call sites. This is the whole reason phase 1 can ship first.

### 4.7 Tests

- Unit: the discriminated-union schema, both `kind`s, date round-tripping.
- Rules: PM reads all · crew reads own · **crew denied another person's record** · crew denied
  the unconstrained list query · crew denied write · non-member denied entirely.
- Emulator E2E: **signed in as `tech`** — panel shows own records only; **signed in as PM** —
  shows everyone's.

## 5. Phase 2 — the Production Coordinator capability

A company-wide claim, following the production-director precedent (a function that cannot be
derived from event membership). **Does not touch `EVENT_ROLES`** — no fourth per-event role, so
none of the 49 role-branching sites, 17 rules branches, or the Team & access UI change.

### 5.1 The claim

`setUserProductionCoordinator` callable, mirrored to `users/{uid}.productionCoordinator`,
granted per user in **Admin → Users** — the same shape as `setUserProductionDirector`. Rules
helper `isCoordinator()` alongside `isProductionDirector()`.

### 5.2 The four write surfaces

**⚠ `canEditEvent` must NOT be widened.** It is
`isAdmin() || hasEventRole(eventId,'production-manager')` (`firestore.rules:85`) and gates
advances, production records, stages, packets, checklists, and quotes. Widening it would hand the
coordinator the entire event to let them book a hotel. **Each surface gets its own branch:**

| Surface | Rule change |
| --- | --- |
| `events/{id}/crewLogistics/**` | already written with the branch in 4.3 |
| `events/{id}/contacts/{attachId}` (crew roster) | add `|| isCoordinator()` to create/update/delete |
| `contacts/{contactId}` (global directory) | add `isCoordinator()` alongside `isProductionDirector()` |
| `events/{id}/scheduleDays/{dayKey}` | add `|| isCoordinator()` to the write gate, keeping `validDayShape()` and the `revision` optimistic-concurrency guard |

### 5.3 Two consequences, accepted knowingly

**Crew-roster write is an access-granting power.** Attaching a contact auto-enrolls that
person's account as a Tech on the event (`EventContactsPanel.tsx:150-162`). So a coordinator can
*grant event access*, which no other non-admin, non-PM can do. This was flagged when the scope
was chosen and accepted.

**This is the second exception to the per-event RBAC model.** ROADMAP §4 records the production
director as "the first deliberate exception". With two, "roles are per-event" needs a stated
principle for when a capability becomes global — the working one being *a function that cannot be
derived from event membership because it spans shows by nature*. Record that in ROADMAP §4 rather
than letting exceptions accumulate case by case.

### 5.4 Tests

Rules cases mirroring the director suite: coordinator writes crewLogistics / crew roster /
directory / schedule days on an event they hold **no membership on**; coordinator **denied**
advances, production records, packets, checklists, quotes — the `canEditEvent` surfaces — which
is the test that proves the gate was not widened.

## 6. Sequencing

1. **Phase 1** — model, rules, service, panel, tests. PM-only writes. Ships useful alone.
2. **Phase 2** — the coordinator claim + four rule branches + admin toggle. One-line widening of
   `canManageCrewLogistics` because of 4.6.

Phase 2 can also ship first if travel booking is the more urgent need — the four surfaces except
`crewLogistics` already exist. Nothing forces the order except that phase 2's fourth surface does
not exist until phase 1 lands.

## 7. Open items

- **Field set is a proposal, not confirmed by use.** There is no prior art anywhere in the repo —
  the lodging sweep returns zero hits across code *and* planning docs — so §4.1 was drafted from
  the domain, not from a real form. Expect one revision after a PM uses it. Adding a field is
  cheap; changing the *shape* is not.
- **No cross-event view.** "Where is Joe this season" needs a collection-group query and a
  different rules story. Out of scope, likely wanted eventually.
- **`EventProduction.contacts[]` remains a third people-surface.** The crew roster, the contacts
  directory, and this hand-typed `{role,name,phone,email}` array on the production record still
  do not reference each other. This plan adds a fourth thing hanging off crew without reconciling
  them. Noted in IDEAS §3 grounding and still unresolved.
