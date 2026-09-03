# Read-access scoping — contacts directory & artist document library — plan

**Status: IN PROGRESS — decisions locked 2026-09-03; PR 0 (#306) and PR 1 merged, rules not yet
narrowed.** The client and functions half is built: crew rosters render from denormalized
copies, the library query and both directory routes are gated, and the broker authorizes
included documents. Until the §4.1 rules deploy (PR 2), `contacts/{id}` and
`artistDocuments/{id}` are **still readable by every approved user** — the guards shipped so
far are UX, and the enforcement is what remains. Next: the owner's Hosting release, then the
backfill, then PR 2.
Graduates [`IDEAS.md`](IDEAS.md) §5 ("Scope non-PM access to what a crew member actually
needs"), which narrowed to a **read**-side question after the write side shipped in the
director (2026-08-10) and coordinator (2026-08-28) work. Companion context:
[`ROADMAP.md`](ROADMAP.md) §4 (the per-event RBAC model and its two global exceptions) and
§11 (the contacts directory), and the archived
[`CREW_TRAVEL_LODGING_PLAN.md`](archive/feature/CREW_TRAVEL_LODGING_PLAN.md) (whose
denormalized-`userId` pattern this plan reuses for display fields).

## 1. What this closes

Two **global** collections are readable by every approved account — including Techs
auto-enrolled by a crew attachment:

| Surface | Today | What leaks |
| --- | --- | --- |
| `contacts/{id}` | `allow read: if isActiveUser()` (`firestore.rules:244`) | The whole cross-company directory: every name, phone, email, and note across all five vendor companies |
| `artistDocuments/{id}` | `allow read: if isActiveUser()` (`firestore.rules:198`) | The entire artist document library's metadata, every artist, every show |
| `getArtistDocumentContent` callable | `assertActiveUser` only for library docs (`functions/src/googleDrive.ts:643`) | The **file bytes** — the broker deliberately mirrors the wide rule |

The callable row is why a rules change alone is insufficient: the Admin SDK bypasses rules,
so the broker must re-assert whatever the rules newly enforce, in the same release.

Everything else at `isActiveUser()` (departments, festivals, templates, schedule/checklist
templates, document categories, `config/*`) is non-personal reference data and stays wide.
The per-event wideness (any member reads the full production record) is a separate, deeper
cut and is explicitly **out of scope** (§7).

## 2. Decisions (locked 2026-09-03)

| # | Decision | Resolution |
| --- | --- | --- |
| 1 | Who reads the global contacts directory (and browses `/contacts`)? | **Global capabilities only: admin ∨ organizer ∨ production director ∨ production coordinator.** A rules gate on a global collection can only see global claims — "is PM somewhere" is not expressible (the membership join runs the wrong direction). Policy consequence, owner-accepted: anyone who runs shows holds `organizer`. Verified live 2026-09-03 (§3): already true. |
| 2 | What do ordinary event members (techs, department leads) see of their own show's crew? | **The full contact card, denormalized into the attach doc** — `contactName`, `contactCompany`, `contactPhone`, `contactEmail`, `contactPhoto` copied onto `events/{e}/contacts/{attachId}`. Crew on a show legitimately need to reach each other; this is "your show's people" without the directory. Precedent: member docs already denormalize `email`/`displayName`; crew logistics already denormalizes `userId`. |
| 3 | Does a user keep reading their **own** linked contact (Settings → profile photo)? | **Yes**, via a `resource.data.userId == request.auth.uid` read branch — it authorizes exactly the uid-constrained query `getMyContact` already issues (the same query-shaped pattern crew logistics uses) and nothing wider. |
| 4 | Who reads `artistDocuments` (and browses `/documents`)? | **The same global-capability set.** One shared rules helper for both collections; splitting the populations later costs one function body (the `canCreateEvents`/`canOverseeAllEvents` rationale). |
| 5 | Can members still **open** artist-library docs included on their advances? | **Yes, via a broker inclusion check**: the callable verifies the file is included on the named advance of an event the caller can read. Members keep exactly the documents an editor deliberately put in front of them — the feature's point. Browsing the library becomes privileged either way. |
| 6 | Contact photos in Storage (`contacts/photos/**`)? | **Stay readable to any approved user** this pass. Headshots are the least sensitive field and the members' roster view keeps them; no Storage-rules machinery. |
| 7 | Department leads: with PMs or with techs? | **Resolved by architecture, not preference**: no global claim → no directory. Leads see the denormalized roster like any member. The 2026-08-10 half-answer (the director joins the permitted set) stands. |

**The capability naming** (per the §4 discipline): the new predicate is
`canBrowseGlobalDirectories` — named for the capability, never the claims that grant it —
in both `firestore.rules` and `src/lib/rbac/permissions.ts`.

## 3. The live blast radius (audited 2026-09-03, read-only ADC query)

- Three user records total. The **only PM** (`jared@46entertainment.com`, PM on both events,
  also the `ADMIN_EMAILS` account) **holds `organizer`** — decision 1's precondition is
  already fact, not migration work.
- The **only tech membership** belongs to the revoked test account (`jared@jaredfoh.com`,
  `approved: false` — the weak-credential item in `DEPLOYMENTS.md`'s open queue).
- Director + coordinator: the owner account (`jared@yourstagemanager.com`).

So there are currently **zero approved users outside the privileged set**. Nothing breaks
for anyone real, and the field-population risk of the client/rules rollout gap (§6) is ~0.
This is the cheapest moment this change will ever have.

## 4. Design

### 4.1 Rules changes (`firestore.rules`)

```text
function canBrowseGlobalDirectories() {
  return isAdmin()
    || isOrganizer()
    || isProductionDirector()
    || isProductionCoordinator();
}

match /contacts/{contactId} {
  allow read: if canBrowseGlobalDirectories()
    || (isActiveUser() && resource.data.userId == request.auth.uid);
  // create/update/delete unchanged
}

match /artistDocuments/{docId} {
  allow read: if canBrowseGlobalDirectories();
  // create/update/delete unchanged
}
```

Notes:

- The `userId` branch is **query-shaped**: it satisfies `getMyContact`'s
  `where('userId','==',uid) limit(1)` list query and per-doc gets of one's own mirror, and
  nothing else. Directory-wide lists still require the capability.
- The rules-internal `get()` in the crewLogistics create rule (`linkedContact()`,
  `firestore.rules:499`) ignores read rules — unaffected.
- `users/{uid}` (admin-or-self), the per-event attach docs (`canReadEvent`), and every write
  gate are untouched.
- `storage.rules` untouched (decision 6).

### 4.2 The roster denormalization (the one real model change)

`listEventContacts` today resolves attachments by listing the **whole directory**
(`Promise.all([attachments, listContacts()])`,
`src/features/events/event-contacts-service.ts:43-63`) — and `EventContactsPanel` runs it
ungated for every member. Under the new rule that breaks every non-privileged member's
event page, so:

- **Attach docs grow display copies**, written at attach time (the attacher can read the
  directory — the picker is gated on `canBrowseGlobalDirectories`). These are **display data,
  not authorization data** — unlike the crewLogistics `userId` copy there is no rules gate
  hanging off them, so client-written copies are acceptable; the trigger below keeps them
  honest.
  - **Shape, as built (PR 1):** a nested `contact` map — `{name, role, company, phone, email}`
    — rather than the flat `contactName`/`contactCompany`/… this section first sketched. One
    field to write and refresh, it maps 1:1 onto what the roster renders, and it keeps the
    copy visibly distinct from the join's own fields. The snapshot deliberately omits
    `photo` (the roster does not render one today) and `userId` (authorization data).
  - **Deleted directory entries keep their copy**, with a `contactDeletedAt` stamp — added
    during PR 1, not in the original sketch. Blanking a roster row because a directory entry
    was tidied up would lose who was actually on the show; the stamp preserves the existing
    "no longer in the directory" signal while keeping the name. It clears if a contact
    reappears under the same id.
- **`listEventContacts` reworked** to render from the attach docs alone — one member-gated
  read, no directory join, for every viewer. (Also kills the standing inefficiency of a
  1000-doc list to resolve three crew members.) The directory query survives only in the
  add-crew picker, `enabled:` the viewer's browsing capability.
- **Freshness**: a trigger on `contacts/{contactId}` propagates display-field changes to every
  attach doc referencing the contact.
  - **As built (PR 1):** a SEPARATE trigger in a new `functions/src/crewContacts.ts`, rather
    than extending `reconcileCrewLogisticsOnContactWrite` as this section first proposed. That
    function reconciles `userId` — authorization data under a strict consistency model its
    file header spells out. Folding a cosmetic name change into it would put the two on the
    same footing and complicate a deliberately careful piece of code. Two small triggers on
    the same path, one concern each; the extra invocation is negligible at this scale.
  - Needs a **collection-group index** on the attach subcollection's `contactId`. ⚠ The
    subcollection is literally named `contacts`, so `collectionGroup('contacts')` also
    matches the top-level directory — harmless here (directory docs carry no `contactId`
    field, so they never match the filter, and the trigger runs Admin-SDK), but worth the
    comment in the code.
- **Backfill**: one-time script (`scripts/`, ADC) stamping the copies onto existing attach
  docs. Current data is small (two events); idempotent, re-runnable.

### 4.3 Client changes

| Change | Where |
| --- | --- |
| `canBrowseGlobalDirectories(viewer)` predicate | `src/lib/rbac/permissions.ts` (+ mirror comment in the rules) |
| **`useViewer()` extraction** — the deferred cleanup from the Phase 2 sweep (IDEAS "findings") lands here as its own prep PR; every screen this plan touches needs the viewer | `src/lib/rbac/useViewer.ts` (new) |
| Route guards for `/contacts`, `/documents`, `/documents/artists/:artistKey` — today reachable by URL by anyone (`App.tsx:145-147`); the rules will deny the reads, the guard makes it a redirect instead of an error screen. Same shape as `AdminGate`. | `src/App.tsx` + a small `CapabilityGate` |
| `EventContactsPanel`: render roster from denormalized attach fields; directory picker query gated `enabled: canBrowse` | `src/features/events/EventContactsPanel.tsx` |
| `TravelLodgingPanel` roster join follows the same rework (it consumes `listEventContacts`) | `src/features/events/TravelLodgingPanel.tsx` |
| `AdvanceDocumentsPanel`: the library query (`listDocumentsForArtist`) becomes `enabled: canEdit` — it only populates the include-checkboxes; viewers read the **included** set from the member-readable advance subcollection, which already carries copied metadata | `src/features/events/AdvanceDocumentsPanel.tsx:53` |
| `openArtistDocument` passes advance context (`eventId`/`stageId`/`advanceId`) so the broker can run the inclusion check for non-privileged callers | `src/lib/google/drive-service.ts` |
| Nav: `resolveNavVisibility`'s `cross-event` case now **delegates** to `canBrowseGlobalDirectories` instead of restating the four claims inline (as `pm-or-oversight` delegates to `canViewTracker`). That restatement is exactly what let the coordinator drift into one list and not the other; the file's "no rules counterpart" note is retired, since it has one now | `src/lib/nav/items.ts` |

### 4.4 Server changes

- **`getArtistDocumentContent`** (`functions/src/googleDrive.ts:631`): for a caller without
  a browsing capability, a library doc is served only with advance context — assert
  `assertCanReadEvent(eventId)` **and** the existence of
  `events/{e}/stages/{s}/advances/{a}/documents/{fileId}` (the inclusion record). Privileged
  callers keep today's direct path. Input schema (`@contracts`) gains the optional advance
  path; rate limits unchanged.
- **Trigger extension + backfill** per §4.2.
- No other callable moves: `importDriveFolder` is already admin/organizer; event-doc flows
  are already event-gated.

### 4.5 What deliberately does NOT change

Per-event member reads (production record, roster, advances, schedules), the crewLogistics
privacy model, all reference/config collections, `users/{uid}`, Storage rules, every write
gate, and the claim set — **no new claim is minted**. This plan spends only existing
capabilities; the §4 principle ("a third global claim should have to argue against the
recorded sentence") is not tested here.

## 5. Test plan

- **Rules tests** (extend first, then flip): the two assertions that pin the wide policy
  flip by design (`test/firestore.rules.test.ts:1112` tech reads a contact; `:1301` tech
  reads a library doc). Add: organizer/director/coordinator read both collections; tech
  denied both; tech's own-`userId` query and doc read allowed; another user's contact
  denied; the stale describe wording at `:206-210` updated.
- **Emulator (functions)**: trigger propagates a contact edit to attach-doc copies;
  broker serves an included doc to a member with advance context, refuses without context,
  refuses a non-included fileId, serves a privileged caller directly.
- **E2E (emulator)**: tech's event page renders the crew roster (from copies) with the
  directory rule tightened; tech's advance page lists and opens included docs; tech at
  `/contacts` and `/documents` gets redirected; organizer sees both screens. Update the
  pinned narratives: `EventContactsPanel.crossEvent.test.tsx` header,
  `tests/emulator/nav-disclosure.emulator.spec.ts` caveat comments.
- **Unit**: `canBrowseGlobalDirectories`, `useViewer`, reworked `listEventContacts`.

## 6. Sequencing — the order is the safety

Rules deploy instantly; clients update on the owner's Hosting schedule. A tightened rule
against a live client still issuing wide queries breaks that user, so **client first, rules
last**:

1. **PR 0 (prep, optional but cheap)**: `useViewer()` extraction, mechanical.
2. **PR 1 (client + functions)**: denormalization writes + reworked panels + gated queries +
   route guards + broker inclusion check + trigger extension + backfill script + all tests
   that don't depend on the tightened rules. Deploy functions; run backfill; owner runs the
   Hosting release.
3. **Verify live**: with the released client, a non-privileged session issues no directory
   or library queries. (§3: no such account is currently approved — the emulator E2E is the
   real gate. If the revoked test account is re-approved for a by-hand check, its password
   is changed first, per the standing DEPLOYMENTS item; that same session can also exercise
   the director read-only residual.)
4. **PR 2 (rules)**: the §4.1 tightening + flipped rules tests. Deploy Firestore rules
   (owner account, secrets health check, explicit confirmation — per `DEPLOYMENTS.md`).
   Rollback = redeploy the prior rules from git; no data migration to unwind (the
   denormalized copies are additive and harmless under the old rules).

## 7. Out of scope / open items

- **Per-event read narrowing** (any member reads the full production record) — the
  remaining half of the original IDEAS §5. Different blast radius, own decision.
- **"Documents for artists on my events"** as a browsable member surface — resolved
  narrowly here (included-only, via broker); a per-artist membership-joined library view
  remains unbuilt and undecided.
- **Splitting the two directories' read populations** (contacts vs documents) — one
  function body away if ever wanted.
- **`EventProduction.contacts[]`** (the third people-surface) — untouched; tracked in
  IDEAS §3 leftovers.
