# Crew travel & lodging — plan

**Status: COMPLETE — both phases LIVE on every target as of 2026-08-24.** Phase 1 (#296)
backends deployed 2026-08-21 (rules + indexes + functions); Phase 2 (#298) backends deployed
2026-08-24 (Firestore rules + Storage rules + functions); the owner Hosting release of
2026-08-24 16:29Z (`262b0d7`) carried both clients at once — the Travel & Lodging panel,
the callable-based crew detach, and the Admin → Users **Production coordinator** toggle.
Re-verified live 2026-08-28 (bundle markers, `functions:list`, `firestore:indexes`); the
ledger entries in [`DEPLOYMENTS.md`](DEPLOYMENTS.md) hold the evidence and rollback steps.
Phase 2 = §2.1 #2 resolved 2026-08-21 (full cross-event read, threat-model cost accepted): the
`setUserProductionCoordinator` claim lifecycle, the oversight-read widening
(`canOverseeAllEvents` in rules/storage/client), the four write surfaces, the Tech-only
auto-enroll authorization in `assignEventMember`, the Admin → Users toggle, and tests at
four layers (predicate unit · rules matrix incl. every-canEditEvent-surface-denied ·
functions-emulator claim lifecycle + auto-enroll branch · E2E persona with zero
memberships). **Nobody holds the coordinator claim yet** — granting the first one is an
Admin → Users action. What remains is use, not build: see §7.
Scoped 2026-08-20 from [`IDEAS.md`](IDEAS.md) §3 (raised 2026-08-08), whose grounding was
re-verified against the codebase the same day before scoping. Security/data-integrity review
was folded in on 2026-08-20. **Ships in two phases** that are independently valuable and
independently verifiable once their gates are resolved.

> **Phase 1 as built:** model `src/lib/logistics/crewLogistics.ts` · predicates
> `canManageCrewLogistics`/`canViewAllCrewLogistics` · rules block + `validCrewLogisticsWrite`
> + contact-link immutability + server-only detach · collection-group indexes · backend
> `functions/src/crewLogistics.ts` (trigger + `detachEventContact` + `relinkContactUser`) ·
> service + `TravelLodgingPanel` · tests at four layers (13 unit + 4 predicate · 18 rules +
> 2 deliberate updates to prior assertions · 12 functions-emulator · 3 E2E, crew case signed
> in as tech). The emulator layer caught a real transaction-ordering bug in the relink
> (reads-after-writes), which is the layer working as intended.

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

Per-person lodging and travel is a **third shape**: a record attached to a _person_, spanning
_dates_. That is the whole reason this is a plan rather than an append to
`src/lib/advances/fields.ts`.

Concretely, the schedule grid **cannot** carry it even if we wanted it to: `ScheduleItem.fields`
is typed `Record<string, string>` (`src/lib/schedules/scheduleDay.ts:57`) — strings only, no
dates, no numbers, no nesting — and the editor prunes any key the item type does not declare.

## 2. Decisions (locked 2026-08-20)

| #   | Decision                       | Chosen                                                            |
| --- | ------------------------------ | ----------------------------------------------------------------- |
| 1   | PM and crew visibility         | **PMs see all; each person sees only their own**                  |
| 2   | Population                     | **46 Entertainment crew only**                                    |
| 3   | Lodging model                  | **Flat per-person records**                                       |
| 4   | v1 scope                       | **Lodging + per-person travel**                                   |
| 5   | Existing schedule travel rows  | **Keep both — different subjects**                                |
| 6   | PDF packet                     | **No — in-app only**                                              |
| 7   | Calendar subscription feed     | **Not in v1**                                                     |
| 8   | UI location                    | **Its own Travel & Lodging panel**                                |
| 9   | Write access                   | **PMs, plus a new Production Coordinator**                        |
| 10  | Coordinator shape              | **Company-wide capability**, not a per-event role                 |
| 11  | Coordinator writes             | travel/lodging · crew roster · contacts directory · schedule days |
| 12  | Production-director visibility | **Sees all crew logistics**, preserving shipped oversight         |
| 13  | Admin contact relinking        | **Retained**, through an atomic admin-only server workflow        |

**These interlock — do not change one in isolation.** Decisions 6 and 7 are what make decision 1
real: the packet is generated server-side and downloaded through a member-gated URL, so printing
rooming lists would expose every itinerary to any event member regardless of the Firestore rules.
The calendar feed is event-scoped (`pushToCalendar` is global to everyone subscribed), so feeding
it would do the same. **Both leak paths are closed by scope, not by rules.** Reopening either
reopens the privacy question.

Decisions 2 and 3 also interlock: flat per-person records cannot express a room block with
unassigned slots, which is exactly why unnamed labor blocks were excluded. **Adding blocks later
is a model change, not a field addition.**

Decision 12 preserves ROADMAP §4's shipped promise that a production director can inspect every
event's crew and the PM's work. They read every logistics record but receive no logistics write
power from that claim. Decision 13 preserves the existing deliberate admin-only identity action;
the enforcement path changes because relinking now has denormalized authorization data to update.

### 2.1 Implementation prerequisites — not product decisions yet

The locked choices above expose two questions the current code cannot answer safely. Do not begin
the affected phase by guessing:

1. **What exactly makes a contact “46 Entertainment crew”? — RESOLVED 2026-08-20: any roster
   member.** The code enforces exactly one thing: a logistics record references an attachment on
   the event's crew roster (`eventContactId`). The roster demonstrably spans companies (Stageline
   et al.), so decision 2's "46 Entertainment crew only" is recorded as **business practice about
   whose travel the company books, not a rules invariant** — no classification field, no config
   list, and nothing breaks if a vendor's room is ever booked. Eligibility is never inferred from
   the free-form `company` string.
2. **What may a company-wide coordinator read? — RESOLVED 2026-08-21: full cross-event read,
   like the director.** The coordinator claim joins `canOverseeAllEvents()` (rules, storage,
   and client), so events-list discovery, event pages, schedules, and every oversight read
   surface work with zero per-event setup — one population, not two subtly different ones.
   **The threat-model cost was stated and accepted explicitly:** under today's canonical gate
   this grants reads of advances, production records, quotes, packets, and checklists — the
   travel booker can read every artist's financials. The alternatives (per-event membership;
   a narrow read model) were presented and declined. Writes remain exactly the four narrow
   surfaces in §5.2; joining the read population widens **no** write.

## 3. What "each person sees only their own" rests on

IDEAS §3 treated this as needing a new identity join. **It does not** — verified 2026-08-20:

`linkOrCreateContact` (`functions/src/index.ts:149-200`) runs on first sign-in without an existing
`users/{uid}.contactId`. It chooses an admin-pre-added contact matched by email or creates a
self-mirror at `contacts/{uid}`; the user document's `contactId` is the canonical account →
contact pointer. `setUserDisplayName` keeps one linked contact's name in sync (`index.ts:442`), and
`deleteUser` unlinks every matching contact (`index.ts:506`). This is enough to ground the join,
but it is **not** a database-enforced uniqueness guarantee: legacy/admin-created duplicates and
contact deletion still need the lifecycle handling in §4.2.

> **Doc-accuracy consequence:** ROADMAP §11 still says "User-account link deferred". That is
> stale — the link exists and is maintained server-side. Fix when this lands.

**The protection is narrower than it sounds, and that is accepted.** Every event member already
reads the full crew roster — names, phones, emails — via `canReadEvent`, and that does not
change. This protects room numbers and confirmation codes, not contact details.

**It also only works for crew who sign in.** A contact with no account has `userId == null`, so
their records are visible to PMs, production directors, and the coordinator only. That is correct
behavior, not a gap.

## 4. Phase 1 — Travel & Lodging (PM writes only)

Ships complete and useful with no new role/capability. It does tighten identity-field and detach
rules as part of the privacy boundary. Phase 2 widens who can write.

### 4.1 Data model

One subcollection with a discriminated union, **not** two collections: the privacy
denormalization, the rules block, and the panel's query all want to exist once.

```
events/{eventId}/crewLogistics/{recordId}
  kind        'lodging' | 'travel'
  eventContactId string          // events/{eventId}/contacts/{attachId}; proves event-crew scope
  contactId   string             // must equal that attachment's contacts/{id} reference
  userId      string | null     // DENORMALIZED from contact.userId — see 4.2
  notes       string | null
  createdBy / createdAt / updatedAt

  kind === 'lodging'
    hotelName · address · hotelPhone · confirmation
    checkInDate: 'YYYY-MM-DD' · checkOutDate: 'YYYY-MM-DD' // date-only, hotel-local calendar
    roomType · roomNumber

  kind === 'travel'
    mode: 'flight' | 'drive' | 'train' | 'other'
    carrier · confirmation · from · to
    departAt: Date | null · arriveAt: Date | null          // absolute instants → Timestamp
    departTimeZone: IANA string | null
    arriveTimeZone: IANA string | null
```

Model + Zod in `src/lib/logistics/crewLogistics.ts` (`z.discriminatedUnion` on `kind`); IO in
`src/features/events/crew-logistics-service.ts`. Travel times are real `Timestamp`s, converted via
`src/lib/firestore/timestamps.ts`, and carry the IANA zone in which each wall clock must be shown.
Hotel check-in/out are date-only facts, not instants, so they use validated day keys and must not
be passed through the browser's local zone. If this ever feeds a calendar, the later calendar
design must decide whether a stay is an all-day range or needs actual check-in/out instants; do
not smuggle that future decision into v1 by assigning arbitrary midnight timestamps.

The schema must decide required-versus-null for every proposed field, reject unknown keys, require
`checkOutDate >= checkInDate`, require `arriveAt >= departAt` when both travel instants exist, and
require the corresponding IANA zone whenever a travel instant is present. `createdBy` is
caller-stamped on create and immutable; timestamps use server timestamps.

`roomNumber` is deliberately separate from `roomType` so a future field-selected vendor view can
include one without the other. Separation alone is **not** a privacy boundary—the per-person
record still maps the room to its occupant—and v1 builds no vendor export.

### 4.2 The denormalized `userId` — server-verified authorization field

The read rule must answer "is this record mine?". Rules cannot perform a query join; they can
`get()` an exact attachment/contact path, but doing that for every returned record can exceed
Firestore Rules' dependent-access-call limit on an ordinary multi-record list. `userId` is
therefore copied onto the record so the crew query can constrain `where('userId', '==', uid)` and
the rule can authorize without per-result lookups. Precedent: event member docs already carry
denormalized `email` / `displayName`.

Because this field controls access to confirmation codes and room numbers, every create/update
must prove it against the exact event attachment and global contact (§4.3); it is never an
unchecked client assertion. Tighten the global-contact rule so `userId` is immutable through every
direct client-SDK write, including an admin's. **This changes the enforcement path, not the admin
capability:** sign-in/delete keep their Admin SDK link/unlink paths, and admin relinking moves to an
admin-only `relinkContactUser` callable.

The relink callable validates the old and new account/contact pointers, queries every
`crewLogistics` record for the contact, then updates the contact, both affected `users/{uid}`
pointers, and every denormalized logistics `userId` in one Firestore transaction. Set a conservative
record cap below Firestore's transaction write limit. Above that cap, fail before any write with an
actionable maintenance error; never fall back to a partially applied `ChunkedBatch` relink that
temporarily authorizes the wrong account.

**The cost of denormalizing is staleness. Handle every known lifecycle path:**

- `linkOrCreateContact` links a _pre-added_ contact to an account on first sign-in. Records
  created against that contact **before** the person ever signed in will have `userId == null`
  and need backfill before the panel becomes visible to them.
- `deleteUser` sets the contact link to null. The Auth deletion already removes the old account's
  ability to authenticate, but the denormalized copies still need cleanup.
- An admin relink is atomic through `relinkContactUser`; rules continue to deny the same operation
  from production directors, coordinators, and every direct client write.
- A global-contact deletion and legacy duplicate links must reconcile all records referencing that
  contact.
- In v1, block roster detachment while that attachment has logistics records; the UI requires the
  PM/coordinator to delete or reassign them first. A silent orphan is not acceptable, and
  auto-enrollment currently does not auto-remove membership on detach. Because rules cannot query
  for dependent logistics records, route detach through a server callable that enforces this
  behavior and remove the direct-delete bypass.

Use a retryable server reconciliation path (a contact-write trigger, with a synchronous best-effort
call from the sign-in/delete paths) for ordinary link/unlink/delete cleanup. It queries the
`crewLogistics` collection group by `contactId` and writes with `ChunkedBatch`; this is safe for
null→uid visibility backfill and uid→null cleanup. Do **not** use that eventually consistent path
for uid A→uid B relinking—the bounded atomic callable above owns that case. Add collection-group
indexes for both `crewLogistics.contactId` and `crewLogistics.userId` to
`firestore.indexes.json` and include the index deploy in the backend release target.

### 4.3 Rules

Phase 1 must not reference a Phase-2-only helper. Its read boundary is:

```
match /events/{eventId}/crewLogistics/{recordId} {
  allow read: if canViewAllCrewLogistics(eventId)
    || (isMember(eventId)
        && resource.data.userId == request.auth.uid);
  allow create, update: if canEditEvent(eventId) && validCrewLogisticsWrite(eventId);
  allow delete: if canEditEvent(eventId);
}
```

`isMember` carries the active/approved-user gate. The self branch must never be only
`resource.data.userId == request.auth.uid`: that would let a pending/revoked matching account, or
an approved non-member, read the record and would contradict the non-member-denied invariant.

`validCrewLogisticsWrite` is load-bearing, not optional hardening. It must verify that:

- `eventContactId` names an existing `events/{eventId}/contacts/{attachId}`;
- that attachment's `contactId` equals the record's `contactId`;
- the record's `userId` equals the current `contacts/{contactId}.userId` (or null when unlinked);
- the discriminated shape, allowed keys, dates/zones, and audit-field invariants hold; and
- updates cannot rewrite `createdBy` / `createdAt`.

If those checks become impractical in rules, move create/update behind a callable that derives the
identity fields server-side; do not fall back to trusting client-supplied `userId`.

Phase 2 widens this block per §2.1's resolved coordinator read scope:

```
allow read: if canViewAllCrewLogistics(eventId)
  || (isMember(eventId)
      && resource.data.userId == request.auth.uid);
allow create, update: if canManageCrewLogistics(eventId) && validCrewLogisticsWrite(eventId);
allow delete: if canManageCrewLogistics(eventId);
```

The rules-side `canManageCrewLogistics` is `canEditEvent` in Phase 1. Its Phase 2 coordinator
branch follows §2.1 exactly: a bare active claim only if cross-event access is chosen, or an active
claim plus membership if membership is required. `canViewAllCrewLogistics` is the read superset:
it includes `canManageCrewLogistics` **or** `isProductionDirector()`. This preserves the existing
director convention while keeping that claim read-only.

**⚠ The list-query trap — this is the one thing most likely to ship broken.** Firestore evaluates
`list` against the _query_, not the returned documents. A crew member issuing an unconstrained
`collection(...)` read is **denied**, even though every document they would receive is one they
may read. The client must issue `where('userId','==',uid)` for non-managers and the unconstrained
query for admin/PM/production director. In Phase 2, a coordinator uses the all-records query only
if §2.1's read decision grants that view. Query scope must be selected from
`canViewAllCrewLogistics`, not from an ad-hoc admin or role check.

This is the exact failure mode of the 2026-08-10 slug bug — a list query denied for members while
every test signed in as admin. **Non-negotiable: the emulator test for this panel signs in as a
tech, not an admin.**

### 4.4 UI

New `TravelLodgingPanel` on the event page (`src/features/events/`), rendering as its own panel
per decision 8.

- **PM view:** every crew member's records, grouped by person, with add/edit/delete. The
  coordinator gets this same view in Phase 2 only after §2.1's read/discovery decision is wired.
- **Production-director view:** every crew member's records, grouped by person, read-only unless
  the director separately holds admin or this event's PM role.
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
`isCoordinator`. In phase 1 only admin and PM satisfy it. Phase 2 then widens **one write
predicate** instead of sweeping call sites. The separate `canViewAllCrewLogistics(viewer, role)`
adds production-director read oversight and owns the all-records versus self-query choice.

### 4.7 Tests

- Unit: the discriminated-union schema, both `kind`s, lodging day-key validation/ranges, travel
  Timestamp round-tripping, and IANA-zone requirements.
- Rules: PM reads all · crew reads own · **crew denied another person's record** · crew denied
  the unconstrained list query · crew denied write · matching-uid but unapproved account denied ·
  matching-uid but non-member denied · mismatched/forged `contactId` / `eventContactId` / `userId`
  denied · every direct client write including admin denied global-contact `userId` rewrites ·
  malformed discriminated shapes denied · production director reads every logistics record but is
  denied create/update/delete without a separate PM/admin capability.
- Functions emulator: first-sign-in backfill · delete cleanup · bounded admin A→B relink updates
  contact/user pointers and every logistics record atomically · over-cap relink fails with no
  partial writes · non-admin relink denied · contact deletion · roster detach blocked while
  logistics exist · retry after partial reconciliation · more records than one cleanup batch.
- Service/unit: PM and production director use the all-records query; only the PM gets controls;
  ordinary crew uses the uid-constrained query; no call site can accidentally issue the other
  scope.
- Emulator E2E: **signed in as `tech`** — panel shows own records only; **signed in as PM** —
  shows everyone's.

## 5. Phase 2 — the Production Coordinator capability

A company-wide claim, following the production-director precedent (a function that cannot be
derived from event membership). **Does not touch `EVENT_ROLES`** — no fourth per-event role, so
none of the 49 role-branching sites, 17 rules branches, or the Team & access role editor change.
§2.1 #2 (resolved 2026-08-21: full cross-event read) defines how this company-wide writer
discovers and reads the events it coordinates.

### 5.1 The claim

`setUserProductionCoordinator` callable, mirrored to `users/{uid}.productionCoordinator`,
granted per user in **Admin → Users** — the same shape as `setUserProductionDirector`. Rules
helper `isProductionCoordinator()` alongside `isProductionDirector()`.

“Same shape” means the whole claim lifecycle, not only the callable:

- shared input/output contracts and runtime parsing;
- `syncUserClaims` output plus legacy-response normalization in `AuthProvider`;
- cached-token fallback and `AuthContextValue`;
- `Viewer`, `UserProfile`, users-directory parsing, and the Admin → Users toggle;
- revoke refresh tokens when the capability is removed, matching the production-director
  containment behavior; and
- stamped mirror fields plus a structured grant/revoke audit log.

Tests cover absent/false/non-boolean claims, a claim on an unapproved account, grant refresh,
revocation, and an older Functions response with no coordinator field.

### 5.2 The four write surfaces

**⚠ Neither `canEditEvent` nor the server's `assertCanEditEvent` may be widened.** The rules
predicate is
`isAdmin() || hasEventRole(eventId,'production-manager')` (`firestore.rules:85`) and gates
advances, production records, stages, packets, checklists, and quotes. Widening it would hand the
coordinator the entire event to let them book a hotel. Every coordinator branch below carries the
scope qualifier selected in §2.1; do not create blind path-based writes to events the coordinator
cannot discover or read. **Each surface gets its own branch:**

| Surface                                         | Enforcement + client work                                                                                                                                                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events/{id}/crewLogistics/**`                  | Widen rules-side and client `canManageCrewLogistics`; preserve §4.3 validation and query-scope selection.                                                                                                                                                               |
| `events/{id}/contacts/{attachId}` (crew roster) | Add the claim to create/update. Detach moves behind the §4.2 callable, which gets the matching narrow coordinator authorization and blocks while logistics exist. Add a dedicated `canManageCrewRoster` UI predicate rather than reusing the event-wide `canEdit` prop. |
| `contacts/{contactId}` (global directory)       | Add the claim beside `isProductionDirector()` while preserving direct-write `createdBy`/`userId` immutability; `relinkContactUser` remains admin-only. Widen `canManageContact` and route/nav presentation as allowed by §2.1.                                          |
| `events/{id}/scheduleDays/{dayKey}`             | Add a dedicated `canManageScheduleDays` rule/client predicate while keeping `validDayShape()`, `createdBy`, and the `revision` optimistic-concurrency guard. Update `EventScheduleScreen`; changing rules alone leaves every control hidden.                            |

The event root/list/read work selected in §2.1 is a fifth, read-only integration concern. Keep it
separate from the four mutation capabilities so choosing discoverability cannot accidentally
grant more writes.

### 5.3 Two consequences, accepted knowingly

**Crew-roster write is an access-granting power.** Attaching a contact auto-enrolls that
person's account as a Tech on the event (`EventContactsPanel.tsx:170-185`). So a coordinator can
_grant event access_, which no other non-admin, non-PM can do. This was flagged when the scope
was chosen and accepted. Today that enrollment calls `assignEventMember`, whose server gate is
PM/admin-only. Add a narrow coordinator authorization branch **only** when the parsed request is
`role == 'tech' && ifAbsent == true`, or create a separate auto-enroll callable. Do not widen
`assertCanEditEvent` and do not let the coordinator assign PM/department-lead roles, alter an
existing membership, remove members, or change their own access.

**This is the second exception to the per-event RBAC model.** ROADMAP §4 records the production
director as "the first deliberate exception". With two, "roles are per-event" needs a stated
principle for when a capability becomes global — the working one being _a function that cannot be
derived from event membership because it spans shows by nature_. Record that in ROADMAP §4 rather
than letting exceptions accumulate case by case.

### 5.4 Tests

- Rules cases mirroring the director suite: active coordinator writes crewLogistics / crew roster /
  directory / schedule days; coordinator is **denied** advances, production records, packets,
  checklists, quotes, event mutation, stages, and event membership documents—the
  `canEditEvent` surfaces—which proves the broad gate was not widened.
- Read/discovery cases exactly match the §2.1 choice. If cross-event access is chosen, exercise an
  event on which the coordinator has no membership; if membership is required, prove the same
  identity is denied until assigned.
- Functions emulator: coordinator may perform only Tech `ifAbsent` auto-enrollment; attempts to
  assign another role, alter an existing membership, remove a member, or use another
  `assertCanEditEvent` callable are denied.
- Client tests: the four dedicated capability predicates expose only their matching controls;
  schedule/roster/logistics queries succeed for the chosen read scope; event-wide edit controls
  stay hidden.
- Claim lifecycle tests from §5.1, including an unapproved coordinator and post-revoke token
  refresh. As with other custom claims, revoking refresh tokens does not rewrite an
  ID token already issued; document the bounded propagation window and use Approved revocation for
  emergency containment.

## 6. Sequencing

1. ~~Resolve §2.1's crew-population invariant.~~ Resolved 2026-08-20 (any roster member).
2. **Phase 1** — model, rules, indexes, identity reconciliation, service, panel, and tests.
   PM-only writes. Ships useful alone.
3. ~~Resolve §2.1's coordinator read/discovery scope.~~ Resolved 2026-08-21 (full cross-event read).
4. **Phase 2** — the complete coordinator claim lifecycle, selected read path, four narrow write
   capabilities, client predicates/UI, Tech-only auto-enroll authorization, and tests. Logistics
   itself still widens through the single predicate from §4.6.

Phase 2 can ship before Phase 1 if schedule/roster coordination is more urgent, but only after its
read/discovery choice is resolved. In that order it ships the claim plus the three already-existing
write surfaces **and pulls the roster-detach and `relinkContactUser` callables from §4.2 forward
into Phase 2**. Their logistics queries return empty before Phase 1 creates the collection, so
detach behaves as it does today while relink still updates the contact/user pointers atomically;
Phase 1 later adds logistics reconciliation, blocking behavior, and seeded-record tests. The
logistics predicate/rules branch itself is added when Phase 1 lands. No Phase-2-first step may
reference an undeployed Phase 1 callable.

Each phase also updates the canonical code-organization index, the Firestore rules commentary,
ROADMAP (the stale contact-link note, the global-capability principle, and explicit confirmation
that crew logistics remains within production-director oversight), and `CHANGELOG.md`.
The shared-surface audit must record that the planned native app currently has no consumer to
update. Functions/rules/index changes are backend work: after merge, run the secrets health check
where applicable, obtain deploy confirmation, deploy only the changed backend targets, verify, and
record the event in `planning/DEPLOYMENTS.md`. Hosting remains externally managed and is never an
agent deploy target.

## 7. Open items

- **Field set is a proposal, not confirmed by use.** Before this plan there was no prior art in
  the repo, so §4.1 was drafted from the domain rather than a real form. Expect one revision after
  a PM uses it. Adding a field is cheap; changing the _shape_ is not.
- **No cross-event view.** "Where is Joe this season" needs a collection-group query and a
  different rules story. Out of scope, likely wanted eventually.
- **`EventProduction.contacts[]` remains a third people-surface.** The crew roster, the contacts
  directory, and this hand-typed `{role,name,phone,email}` array on the production record still
  do not reference each other. This plan adds a fourth thing hanging off crew without reconciling
  them. Noted in IDEAS §3 grounding and still unresolved.
