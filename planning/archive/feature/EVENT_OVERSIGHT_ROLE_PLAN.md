# Production director — cross-event oversight

> **Status: COMPLETE (2026-08-10).** Decided 2026-08-09, built and merged as `6d7d55b` (#274),
> deployed to Functions + Firestore rules + Storage rules the same day, released to Hosting,
> and **activated** — the first `productionDirector` grant was made and verified in production
> against a holder with zero membership rows (reach, read-only containment, and the Tracker
> gate all confirmed at the claim, mirror, rules, and UI layers). Deploy records, verification
> evidence, and rollback steps are in [`DEPLOYMENTS.md`](../../DEPLOYMENTS.md); the capability
> summary lives in [`ROADMAP.md`](../../ROADMAP.md) §4.
>
> Two things this plan deliberately did **not** do, still open and tracked elsewhere:
> gating the cross-event **Contacts/Documents** nav entries
> ([`PWA_MOBILE_NAV_PLAN.md`](PWA_MOBILE_NAV_PLAN.md)), and tightening the underlying
> `contacts`/`artistDocuments` **rules**, which remain `allow read: if isActiveUser()`
> ([IDEAS §5](../../IDEAS.md)). Neither is a regression from this work — both predate it.
>
> **⚠ Amended after completion (2026-08-10) — read § Capability boundary with this in
> hand.** The owner widened the capability in exactly one way after this plan closed: a
> production director **curates the global contacts directory** and may edit and delete any
> entry, not only their own. The body below was written when the claim carried no writes at
> all and says so in several places; the two bullets it now contradicts are corrected
> in-place under [Capability boundary](#capability-boundary). Everything else stands —
> **every event write gate still ignores the claim**, and relinking a contact to a user
> account (`createdBy`/`userId`) remains admin-only. The decision of record is
> [`ROADMAP.md`](../../ROADMAP.md) §4; the nav consequence is in
> [`PWA_MOBILE_NAV_PLAN.md`](PWA_MOBILE_NAV_PLAN.md). This plan is **not** reopened —
> the widening was decided and shipped separately.

A production director oversees the PMs' work across the whole application. They **may or may
not** be assigned as a PM on any given event, so their access cannot be derived from event
membership — this is the app's first genuinely global, non-admin capability.

Decision: add a distinct `productionDirector` custom claim and widen the application’s
**event read surfaces** for that claim. The claim alone grants no event writes and no admin
functions. The two alternatives considered — auto-enrolling the director as a member of
every event, and computing tracker roll-ups server-side — are recorded in
[Alternatives](#alternatives-considered) with why they lost.

> **This amends a core RBAC decision.** ROADMAP §4 states *"roles are granted PER
> ADVANCE/EVENT, not globally. A user is not assigned one universal role."* This capability
> is the first deliberate exception. The amendment is recorded in ROADMAP §4 rather than
> only here, so the exception is visible where the rule is stated.

---

## Capability boundary

**Read-only, application-wide, over event data.** A production director may list every
event and read the event subtree whether or not they have a membership row.

The claim alone explicitly grants:

- Read access to every event and its member roster, stages, advances, production records,
  event-attached contacts, schedules, bookings, flags, quotes, and event documents.
- Read-only access to the PM checklist. The checklist is the clearest signal of whether a
  PM is on top of a show, so it is included deliberately rather than treated as a private
  scratchpad.
- Tracker access across every event.
- Read access to files stored under the event's Firebase Storage path and event-document
  bytes served through the Drive broker.

It explicitly does **not** grant:

- **Event writes from the director claim.** A director who needs to edit a specific show must
  be assigned a per-event production-manager role. Combined capabilities are additive: a
  director who is also the PM on Event A may edit Event A because of the PM membership, not
  because of the director claim.
  **Corrected 2026-08-10:** as written this bullet said *no* writes at all, which is no
  longer true. The claim now carries exactly one write, and it is outside the event subtree —
  curation of the global contacts directory, described in the superseded bullet below. Over
  event data the sentence above still holds exactly as stated.
- **Admin functions** — no user approval, role granting, branding, account deletion, or
  global configuration.
- **Event creation** — that remains the separate global `organizer` capability.
- ~~**Global Contacts or artist-document-library navigation/authority.**~~ **Superseded
  2026-08-10 — read the rest of this bullet as history.** As shipped, the capability was
  event-scoped even though it spans every event: directors read event-attached contacts and
  documents, the global collections stayed broadly readable to any approved user, and this
  plan asked that the director claim never be added to them automatically — that any such
  expansion be revisited explicitly. **That revisit happened, ahead of
  [IDEAS §5](../../IDEAS.md) and independently of it.** The owner decided the director
  curates the **global contacts directory**: edit and delete on any `contacts/{contactId}`,
  with the account link (`createdBy`/`userId`) still admin-only. The same decision makes
  `cross-event` navigation mean admin / organizer / production director, so director
  navigation is now Events + Tracker + Contacts + Documents + account
  ([PWA_MOBILE_NAV_PLAN.md](PWA_MOBILE_NAV_PLAN.md)). The artist-document **library**
  gained no authority — Documents only rides along on the shared nav rule, and its writes
  remain organizer/admin. IDEAS §5 is still open: both global collections are still
  `allow read: if isActiveUser()`, so nav visibility changes what is offered, not what is
  reachable.

### External file boundary

The app can widen Firestore, Storage, and broker access, but it cannot override Google
Drive ACLs. A linked Drive file opens in the linker’s Drive and may still reject a director
unless it was shared with them or lives in an appropriately shared drive. Treat that as an
accepted external-system limitation and keep the existing UI explanation visible.

## Claim and predicate design

### Claim name

**Add a distinct `productionDirector` claim. Do not reuse `organizer`.**

Reusing `organizer` is tempting and cheaper — the same one or two people may hold it today.
It is rejected because the Admin screen's Organizer toggle is a safety mechanism: a human
reads that label and decides whether to grant it. Today it means "may create events and
curate the document library." Silently turning it into "may read every event in the
application" would make the label lie at exactly the moment someone grants it.

Use these names consistently:

| Layer | Name | Meaning |
| --- | --- | --- |
| Auth custom claim | `productionDirector` | Raw identity attribute |
| `users/{uid}` mirror | `productionDirector` | Admin-visible current state |
| Client auth context | `isProductionDirector` | Resolved boolean |
| Capability predicate | `canOverseeAllEvents()` | Admin or production director |
| Event-read predicate | `canReadEvent(eventId)` | Oversight capability or event membership |
| Tracker predicate | `canViewTrackerForEvent(viewer, role)` | Oversight capability or PM on that event |

The capability predicate includes admins. Do not define `canOverseeAllEvents()` as only the
director claim under a capability-sounding name:

```typescript
export function canOverseeAllEvents(viewer: Viewer): boolean {
  return viewer.isAdmin || viewer.isProductionDirector;
}
```

`canCreateEvents()` remains separate even if the current populations overlap. Organizer is
not a synonym for director, and director is not a synonym for production manager.

### Full claim lifecycle

The change is larger than copying `setUserOrganizer`. Update the complete shared contract:

1. **Callable schemas** — `functions/src/contracts/callables/auth.ts`
   - Add `isProductionDirector: z.boolean().default(false)` to
     `syncUserClaimsOutputSchema`, so the inferred output type stays a required boolean.
   - Add `setUserProductionDirector` input/output schemas and inferred types.
   - **The schema default does not run on the client — the client must normalize
     explicitly.** See below; this is the single easiest thing to get wrong here.
2. **`syncUserClaims` handler** — `functions/src/index.ts`
   - Resolve `existing.productionDirector === true` from Auth custom claims.
   - Mirror `productionDirector` into `users/{uid}`.
   - Return `isProductionDirector` with the other claim summary fields.
   - Continue preserving unrelated custom claims on every claim write.
3. **Admin setter** — `setUserProductionDirector`
   - Admin-only, rate-limited, runtime-validated through the shared schema.
   - Merge the custom claim rather than replacing the claim map.
   - Mirror the boolean to `users/{uid}`.
   - Record `productionDirectorUpdatedAt` and `productionDirectorUpdatedBy` on the user
     document and emit a structured Functions log containing actor uid, target uid, and the
     new boolean. This gives the broad grant a minimal audit trail without inventing a new
     audit-log subsystem.
4. **Canonical client profile**
   - Add `productionDirector: boolean` to `UserProfile` in `src/types/index.ts`.
   - Parse absent/legacy values as `false` in `src/lib/users/users-service.ts`.
5. **Admin client/UI**
   - Add the callable wrapper in `src/features/admin/admin-service.ts`.
   - Add a clearly labeled Production director column/control in `UsersAdmin`.
   - Before granting, confirm with copy that the user will be able to read every event and
     its crew, schedules, advances, production details, and files. Do not hide this impact
     behind a generic “Grant” confirmation.
6. **Auth context**
   - Carry `isProductionDirector` through `auth-context.ts` and `AuthProvider.tsx`.
   - Set it from both the callable response and cached-token fallback.
   - Reset it on sign-out and include it in the memo dependencies/value.
7. **Viewer model and call sites**
   - Add `isProductionDirector` to `Viewer` and audit every constructed viewer object.
   - Delete the unused `canViewEvent` export and its dedicated unit tests. It has no
     production call sites, so widening it would create a misleading, non-enforcing
     checklist item. Observable event access comes from the Firestore rule plus
     `getEventBySlugOrId`; `EventDetailScreen` already renders the denial state when
     `eventQuery.data === null`.
     - **One reference is not definition-only.** `src/lib/rbac/permissions.test.ts:103`
       sits inside `it('can edit event A but only read event B')` alongside two
       `canEditEvent` assertions. **Edit** that test — drop the `canViewEvent` line and keep
       the cross-event `canEditEvent` legs — rather than deleting the case, or the
       "can edit A, not B" scenario loses coverage.
   - Keep edit, flag, department-edit, and member-management predicates unchanged.
   - Update auth/test mocks for the new response field so it is never `undefined`.

### The compatibility guard needs client code, not just the schema

**Output schemas in this codebase are compile-time contracts, not runtime validators.** Only
*inputs* are parsed, server-side, via `parseCallable`. On the client,
`syncUserClaims()` (`src/features/auth/auth-service.ts:69-78`) passes the schema type as a
generic to `httpsCallable<…>` and returns `result.data` **raw**, and
`AuthProvider.tsx:36` destructures that result directly. Nothing calls `.parse()`.

So `z.boolean().default(false)` **never executes on the client**. Against an older Functions
response the field arrives as `undefined`, `setIsProductionDirector(undefined)` puts a
non-boolean into boolean state, and it flows on into `Viewer.isProductionDirector: boolean`
— a type lie that only shows at runtime.

This fails *closed* (`undefined` is falsy, so nobody gains access), but do not rely on the
schema for it. Normalize explicitly, matching the idiom the cached-token fallback path two
lines below already uses (`token.claims.admin === true`):

```typescript
// AuthProvider.applyClaims — normalize at the destructure
const {
  isAdmin: admin,
  isOrganizer: organizer,
  isProductionDirector: director = false,
  approved: ok,
} = await syncUserClaims();
```

Either that, or parse in the wrapper with `syncUserClaimsOutputSchema.parse(result.data)` —
which would make the schema default real, at the cost of introducing runtime output
validation this codebase does not otherwise do. Pick one deliberately; the destructure
default is the smaller change and matches existing practice.

With that in place the guard is genuinely two-way: Functions return the field explicitly
after the forward deploy, and if Functions are rolled back while the new PWA is live, the
client reads `false` instead of `undefined` — and sign-in never depended on the field being
present, because nothing was parsing it.

The callable schemas are shared with future mobile clients. The native app is not built, so
there is no sibling implementation to coordinate today, but the shared contract and
`mobile/AGENTS.md` capability documentation must not drift when native work begins.

### Claim propagation and revocation

Custom-claim changes do not rewrite an ID token already issued to the target user. The
target picks up a grant/revoke on the next token refresh or sign-in; `syncUserClaims`
explicitly refreshes the token during app startup. Document the same roughly one-hour
maximum stale-token window already accepted for direct-SDK approval changes.

Revoking the capability should revoke the target's refresh tokens after the claim update,
but this still does not invalidate an already-issued Firestore token immediately. Emergency
removal of all app access remains the separate Approved revocation path, subject to the same
documented direct-SDK token window. The admin UI should not imply that either revocation is
instantaneous.

## Firestore rules

Today almost every event-subtree read is gated on event membership. Introduce absent-safe
helpers next to the existing auth helpers:

```
function isProductionDirector() {
  return isActiveUser()
    && request.auth.token.get('productionDirector', false) == true;
}

function canOverseeAllEvents() {
  return isAdmin() || isProductionDirector();
}

function canReadEvent(eventId) {
  return canOverseeAllEvents() || isMember(eventId);
}

function canReadChecklist(eventId) {
  return canOverseeAllEvents() || canEditEvent(eventId);
}
```

Replace event-subtree read gates of `isAdmin() || isMember(eventId)` with
`canReadEvent(eventId)`. Do not change any create/update/delete gates.

### Member rows need an explicit change

The nested member rule is not a simple `isAdmin() || isMember(eventId)` expression because
it also permits a user to read their own row. Update it explicitly:

```
match /events/{eventId}/members/{memberUid} {
  allow read: if canReadEvent(eventId)
    || (isActiveUser() && request.auth.uid == memberUid);
  // writes unchanged
}
```

Do **not** broaden the top-level `/{path=**}/members/{memberUid}` collection-group rule.
That rule remains self-only and is what makes “which events am I on?” safe. A director may
list a known event's roster through the nested rule but cannot query everybody's membership
rows across every event.

### Checklist decision

Use `canReadChecklist(eventId)`, not `canReadEvent(eventId)`. This preserves the existing
PM/admin-only behavior for ordinary members while adding director read access:

| Viewer | Checklist read | Checklist write |
| --- | --- | --- |
| Admin | yes | yes |
| Production director, no event membership | yes | no |
| Production director + PM on this event | yes | yes, through PM capability |
| PM | yes | yes |
| Department lead / tech | no | no |

### Exhaustive event-read inventory

Apply and test the read predicate on every current event path:

- Event document and direct member roster.
- Stages and advances.
- Advance Drive-file metadata and included document metadata.
- Quotes.
- Stage production and stage-production attachments.
- Event production and event-production attachments.
- Event contact attachments.
- Checklist through its separate predicate.
- Event documents.
- Schedule days.
- Call bookings.
- Flags/comments.

## Storage and callable enforcement

Firestore access alone does not make oversight usable.

### Firebase Storage

Mirror the same absent-safe claim/capability helpers in `storage.rules` and change only the
event-path **read** rule:

```
match /events/{eventId}/{allPaths=**} {
  allow read: if canReadEvent(eventId);
  allow write: if canEditEvent(eventId) && validUpload();
  allow delete: if canEditEvent(eventId);
}
```

This covers production attachments, quote signed copies, generated PDFs, and other assets
under an event path. Global template/branding/festival/contact-photo rules are unchanged.

### Backend read authorization

Add a canonical `assertCanReadEvent(db, token, uid, eventId)` beside
`assertCanEditEvent`. It must:

1. Re-assert the approved/admin active-user gate.
2. Allow admin or `productionDirector` immediately.
3. Otherwise require the caller's event membership document.

Use it in `getArtistDocumentContent` when an `eventId` is supplied, replacing the inline
admin-or-membership check. Write callables continue using `assertCanEditEvent`; do not add
the director claim to event mutation, member-management, packet-generation, Drive-linking,
or cleanup callables.

## Client data flow

### All-event listing

`src/lib/events/events-read.ts` currently chooses the all-events branch only for admins.
Use `canOverseeAllEvents(viewer)` instead and keep the existing ordered
`EVENTS_READ_CAP` query for both admins and directors. Update the warning text so it no
longer says only “Admin events list.”

Every query key whose result changes with this capability must include
`isProductionDirector` (or a stable derived scope such as `all`/`membership`); otherwise a
claim refresh can retain a membership-scoped result under the same cache key.

**"Result changes" means two different things, and the second is easy to miss:**

- **Scope changes** — a list query returns a different *set*. `['events','list',…]` and the
  Tracker overview `['tracker','overview', uid]` both already carry a viewer segment, so
  they need the capability added to it.
- **Readability flips** — a single-document lookup that previously resolved to `null`
  because the read was denied now resolves to data. These keys carry **no viewer segment at
  all**, so they are invisible to a rule phrased only in terms of scope:
  - `['events','detail', param]` — `useResolvedEvent`, keyed on the raw route param.
  - `['tracker','event', eventId]` — the per-event tracker screen.

The second class matters because **React Query is not cleared on a claim change**.
`AuthProvider` clears the cache on auth *identity* transitions (sign-out, account switch);
granting a claim to the same uid is not one. So a user who visited an event URL before the
grant, saw *"Event not found, or you don't have access,"* and is then made a director keeps
being told the event doesn't exist — served from cache — until something else evicts it.

Add the capability (or a derived scope) to both classes, and cover the grant-mid-session
transition in tests rather than only the fresh-load case.

Export one canonical Events-list query-key factory beside `listEvents` and use it everywhere
that calls that reader. Replace both current literal keys in `EventsListScreen.tsx` and
`PushToEventsPanel.tsx`; the latter is admin-only today, but leaving its duplicate literal
would make cache sharing drift as soon as the main key gains an oversight scope. Test the
factory for member, admin, and director viewers.

The Calendar Feed picker is an intentional exception: feeds contain events the subscriber
is actually a member of, not every event an admin/director can oversee. Preserve its
membership-only query and comment when refactoring `listEvents` so a director does not
silently subscribe to every event.

### Canonical membership summary

Tracker visibility for an ordinary user depends on whether they are a PM anywhere. The nav
cannot reuse the current screen queries implicitly: those functions run under separate
React Query keys and discard membership roles.

Add a canonical cross-event membership read under `src/lib/rbac/`:

- `src/lib/rbac/my-memberships.ts` owns `listMyEventMemberships(uid)`, which performs the
  self-only collection-group query and returns `{ eventId, role }[]`, plus
  `myEventMembershipsKey(uid)`.
- `src/lib/rbac/useMyEventMemberships.ts` owns the small shared React Query hook so
  `AppShell`, Events, Tracker, and the Calendar Feed picker deduplicate the same request.
- In the same implementation change, add this cross-event membership source and its exports
  to the canonical-sources table in `pwa/AGENTS.md`. The existing “Per-event membership IO”
  row continues to describe `membership.ts`; do not overload it or leave the new module
  undiscoverable.

Refactor event-list/tracker read functions to consume the resolved membership summary rather
than issuing their own role-discarding collection-group reads. Admin/director all-event
branches do not need the membership query; the Calendar Feed always does.

Treat membership status as a tri-state in navigation: `unknown | true | false`. Unknown is
not visible, so Tracker never flashes and disappears while membership resolves.

### Tracker policy

The final matrix is:

| Viewer | Tracker UI | Tracker overview lists |
| --- | --- | --- |
| Admin | visible | every event, paged |
| Production director | visible | every event, paged |
| PM on ≥1 event | visible | only events where their role is PM |
| Organizer only | hidden | none; organizer permits creation, not oversight |
| Department lead / tech | hidden | route redirects to Events |

An organizer who creates an event is automatically its PM and therefore qualifies through
that membership. An organizer who has never created or joined an event does not see Tracker.
Organizer remains independent of both admin and production-director capabilities.

Add pure predicates for global and per-event decisions:

```typescript
canViewTracker(viewer, memberships)
canViewTrackerForEvent(viewer, role)
```

Apply the same result to all entry points:

- App-shell navigation.
- The Events-list Tracker button.
- The Event-detail header Tracker button (a second currently-ungated link).
- `/tracker` route/screen.
- `/tracker/:eventId` route/screen; a PM may open it only for events where they are PM.

This gate is a UI/product boundary, not new secrecy. Leads and techs already read the
underlying advance statuses for their events and could compute the same roll-up. The purpose
is to present Tracker only to the people responsible for managing completion.

### Read-only oversight UI

Most event screens already derive mutation controls from `canEditEvent`, so a director with
no membership naturally renders read-only. Two panels need explicit separation:

- **EventTeamPanel** — split view from manage. A director can load/render the member roster
  but receives no add, role-change, department-change, or remove controls. Existing PM/admin
  management behavior stays unchanged; leads/techs remain hidden as today.
- **EventChecklistPanel** — replace the single `canEdit` read/render gate with `canView` and
  `canEdit`. Directors see checklist items and completion stamps but no import, add, rename,
  reorder, completion, or delete controls. PM/admin behavior stays editable.

The Crew panel's “Manage directory →” link follows the PWA nav's organizer/admin
cross-event policy and remains hidden for director/PM/lead/tech unless they also hold one of
those global capabilities.

## Tracker performance guard

Do not send every event through the current nested `Promise.all` roll-up. A 500-event list
cap still permits hundreds of stage queries and potentially thousands of advance reads in
one burst.

For admin/director Tracker:

- Page the ordered event query with a small fixed page (default 25) and a “Load more” UI.
- Compute summaries only for the current page.
- Bound concurrent per-event roll-ups (default 4) rather than one `Promise.all` across the
  entire page.
- Reuse `EVENTS_READ_CAP` as an absolute defensive ceiling, not as the first page size.
- Preserve stable name ordering across cursors and show a clear capped-state message if the
  absolute ceiling is reached.

For ordinary PMs, filter the canonical membership summary to `production-manager` before
loading events and use the same bounded roll-up helper. This prevents events where the user
is only a lead/tech from entering their overview.

If real usage makes even paged client roll-ups too expensive, revisit precomputed summary
documents or the server-side aggregation alternative. Do not silently increase concurrency.

## Documentation and release communication

This is user-facing work, including intentional removals. Before merging the implementation,
update the workspace-root `CHANGELOG.md` under `[Unreleased]`:

- **Added:** production directors can oversee every event and its Tracker in read-only mode.
- **Changed:** Tracker is now limited to admins, production directors, and users who are PMs
  on at least one event. State plainly that department leads and techs no longer receive its
  navigation or routes unless they hold one of those capabilities.
- **Changed:** the all-event Tracker used by admins and production directors is paginated
  rather than loading every event at once.

Treat the Tracker removal as release communication, not an internal RBAC detail. Include it
in the owner Hosting-release handoff as well as the changelog. The `pwa/AGENTS.md`
canonical-source update for the new membership module is part of this implementation, not a
follow-up documentation chore.

## Tests

Rules tests are load-bearing, but this change also crosses Storage, callables, shared
contracts, client permissions, queries, and UI.

### Firestore rules

- Add a director identity with `{ approved: true, productionDirector: true }` and **no event
  memberships**.
- Assert read allowed for every path in the exhaustive inventory on an unassigned event.
- Assert every create/update/delete remains denied for that director-only identity.
- Assert checklist read allowed but every checklist mutation denied.
- Assert a director+PM can perform PM writes only on the assigned event, proving combined
  capabilities are additive rather than director writes leaking globally.
- Assert a director+tech retains global event reads, including an event where they are not a
  member, while still receiving no writes. A lower per-event role must never downgrade the
  global read capability.
- Assert absent, false, and unapproved director claims do not grant oversight.
- Assert the director cannot collection-group query other users' membership rows, while a
  direct roster read for a known event succeeds.
- Re-run the existing admin/PM/lead/tech matrix to prove no regression.

### Storage and callables

- Storage: director reads an event file without membership; writes/deletes fail.
- Storage: missing/false/unapproved claim fails; director+PM writes only on the PM event.
- Storage: director+tech still reads both the assigned event and an unassigned event, with no
  writes from the combined identity.
- `assertCanReadEvent`: admin/director/member pass; outsider and revoked user fail.
- `getArtistDocumentContent`: director opens an event document without membership; cannot
  invoke event-document write callables.
- Admin callable: admin grant/revoke succeeds, preserves unrelated claims, mirrors and
  stamps the user document, and rejects non-admin/unauthenticated callers.
- `syncUserClaims`: returns/mirrors true and false director states without dropping other
  claims.
- Shared-contract compatibility: a `syncUserClaims` response with **no**
  `isProductionDirector` field yields `false` on the client, not `undefined`. Assert this
  against the real client path (`syncUserClaims()` → `AuthProvider.applyClaims`), **not**
  against `syncUserClaimsOutputSchema.parse` — the client never parses the output, so a
  schema-level test would pass while the app still received `undefined`.

### Client and E2E

- Add a `director` emulator persona holding the claim and no memberships.
- AuthProvider handles callable result, cached-token fallback, sign-out reset, and account
  switch without leaking the prior identity's director state.
- `Viewer` predicates cover admin/director/organizer/PM/lead/tech and combined roles; there
  is no `canViewEvent` test because the dead predicate is removed.
- `listEvents` returns every event for a director; membership-only consumers stay scoped.
- The canonical Events-list key factory is used by both Events and template push, and changes
  scope correctly for member/admin/director viewers.
- Shared membership summary preserves roles and powers the PM-only Tracker list.
- Navigation matrix: admin / director / PM / organizer / lead / tech, including unknown PM
  state resolving hidden.
- Gate both Tracker links and both Tracker routes from the same predicates.
- Director opens an unassigned event and its production, schedule, documents, advance, and
  Tracker screens with no edit controls.
- Director+tech opens both the assigned event and an unassigned event, retains global
  Tracker visibility, and receives no additional edit controls.
- Director sees Team and Checklist read-only.
- Tracker page size and concurrency limits are unit-tested; “Load more” preserves ordering
  without duplicates.
- Query-key tests cover a membership-scoped user becoming or ceasing to be a director after
  claim refresh — for **both** key classes: the scope-changing list keys, and the
  readability-flip keys (`['events','detail', param]`, `['tracker','event', eventId]`).
  Include the grant-mid-session case: a cached `null` from a pre-grant visit must not keep
  reporting "not found" after the claim lands.

## Rollout and rollback

This crosses shared callable contracts plus Functions, Firestore rules, Storage rules, and
the externally deployed PWA. Ship in compatibility order:

1. Deploy Functions/contracts first. Old clients ignore the additional
   `isProductionDirector` response field; the new setter and read assertion now exist.
2. Deploy Firestore and Storage rules. With no claims granted yet, the broader branches are
   inert.
3. Release the PWA and its `[Unreleased]` changelog entry through the owner-managed Hosting
   process. The handoff must call out the lead/tech Tracker removal and all-event Tracker
   pagination. New clients can safely depend on the already-deployed callable response and
   rules.
4. Only after the PWA release is verified, grant the first production-director claim and
   verify all-event listing, read-only controls, file reads, and Tracker pagination.

Functions/rules deploys require the workspace's explicit confirmation and health checks;
Hosting remains owner-managed. Record each backend deploy and Hosting checkpoint in
`planning/DEPLOYMENTS.md`.

### Planned withdrawal

Use this availability-preserving order when retiring the capability without an active data
exposure:

1. Revoke every production-director claim and allow for token propagation.
2. Roll back the PWA presentation if needed.
3. Roll back Storage/Firestore read branches.
4. The additive callable fields/setter may remain safely, or roll back Functions last. The
   output-schema default means an older Function response remains compatible with the newer
   PWA, so this ordering is conservative rather than required for sign-in safety.

### Emergency containment

If the wrong person received the claim or event data may be exposed, optimize for containment
instead of UI availability:

1. Immediately deploy the prior restrictive Firestore and Storage read rules. Once active,
   stale tokens carrying `productionDirector` no longer authorize direct event or file reads.
2. Roll back or patch the Functions `assertCanReadEvent` director branch immediately as a
   separate required target. Admin-SDK callables bypass client rules, so the Drive broker is
   not contained by the rules rollback alone.
3. Revoke the claim and the target user's refresh tokens; do not wait for propagation before
   completing steps 1–2.
4. Roll back the PWA presentation after the server-side access paths are closed.

## Consequences accepted deliberately

- **Data blast radius.** The claim permits reading every artist advance, production record,
  crew/event roster, schedule, booking, checklist, quote, flag, and event file. Grant it only
  to someone trusted with all of that data.
- **Token propagation window.** Claim revocation is not instantaneous for an already-issued
  direct-SDK token; approval revocation remains the broader emergency full-access path but
  is subject to the same documented token window.
- **Read cost.** Global oversight is inherently broader. Paging and bounded concurrency are
  mandatory so “read every event” does not mean “read every event at once.”
- **Tracker UX change.** Leads and techs lose Tracker navigation/routes, and admins move from
  an unpaged overview to explicit pages. These are intentional user-visible changes and must
  be communicated in the changelog and Hosting-release handoff.
- **External Drive ACLs.** Linked Drive files may remain unavailable even when app metadata
  is readable.
- **Shared contract.** The new claim is a backend/mobile contract even though only the PWA
  consumes it today.

## Alternatives considered

- **Auto-enrol the director as a member of every event.** No rules change, and membership
  stays the single source of truth with a per-event audit trail. Rejected for bookkeeping
  (every new event needs enrolling, every new director needs backfilling) and semantic drift:
  membership would mean both “works this show” and “oversees this show,” and Team & access
  would list people who are not on the show.
- **Server-side tracker aggregation.** A callable computes roll-ups with the Admin SDK gated
  on the claim, so the director sees progress without gaining read access to content — the
  tightest fit if the real requirement were status only. Rejected because the director is
  intentionally trusted with the underlying event data and needs to drill into it. Revisit
  precomputed/server summaries if paged client roll-ups remain too expensive or if a future
  oversight tier should see status without advance contents.
