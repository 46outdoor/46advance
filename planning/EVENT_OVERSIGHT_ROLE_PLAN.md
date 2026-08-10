# Production director — cross-event oversight

**Decided 2026-08-09. Not yet built.**

A production director oversees the PMs' work across the whole application. They **may or may
not** be assigned as a PM on any given event, so their access cannot be derived from event
membership — this is the app's first genuinely global, non-admin capability.

Decision: add a distinct `productionDirector` custom claim and widen the application’s
**event read surfaces** for that claim. The claim alone grants no writes and no admin
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

- **Writes from the director claim.** A director who needs to edit a specific show must be
  assigned a per-event production-manager role. Combined capabilities are additive: a
  director who is also the PM on Event A may edit Event A because of the PM membership, not
  because of the director claim.
- **Admin functions** — no user approval, role granting, branding, account deletion, or
  global configuration.
- **Event creation** — that remains the separate global `organizer` capability.
- **Global Contacts or artist-document-library navigation/authority.** This capability is
  event-scoped even though it spans every event. Directors can read event-attached contacts
  and documents. Today the global collections remain broadly readable to any approved user;
  if [IDEAS §5](IDEAS.md) later tightens them, do not automatically add the director claim.
  Revisit that expansion explicitly. This preserves the current decision in
  [PWA_MOBILE_NAV_PLAN.md](PWA_MOBILE_NAV_PLAN.md) that `cross-event` navigation means
  organizer/admin, while director navigation is Events + Tracker + account.

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
   - Add required `isProductionDirector: boolean` to `syncUserClaimsOutputSchema`.
   - Add `setUserProductionDirector` input/output schemas and inferred types.
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
   - Update `canViewEvent` to accept oversight without membership; keep edit, flag,
     department-edit, and member-management predicates unchanged.
   - Update auth/test mocks so the new required claim result never becomes accidental
     `undefined`.

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
`isProductionDirector` (or a stable derived scope such as `all`/`membership`). At minimum
this includes the Events list and Tracker overview; otherwise a claim refresh can retain a
membership-scoped result under the same cache key.

The Calendar Feed picker is an intentional exception: feeds contain events the subscriber
is actually a member of, not every event an admin/director can oversee. Preserve its
membership-only query and comment when refactoring `listEvents` so a director does not
silently subscribe to every event.

### Canonical membership summary

Tracker visibility for an ordinary user depends on whether they are a PM anywhere. The nav
cannot reuse the current screen queries implicitly: those functions run under separate
React Query keys and discard membership roles.

Add a canonical cross-event membership read under `src/lib/rbac/`:

- `listMyEventMemberships(uid)` performs the self-only collection-group query and returns
  `{ eventId, role }[]`.
- `myEventMembershipsKey(uid)` is the shared React Query key.
- A small shared hook exposes the query so `AppShell`, Events, Tracker, and the Calendar
  Feed picker deduplicate the same request.

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
| Department lead / tech | hidden | route redirects to Events |

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
- Assert absent, false, and unapproved director claims do not grant oversight.
- Assert the director cannot collection-group query other users' membership rows, while a
  direct roster read for a known event succeeds.
- Re-run the existing admin/PM/lead/tech matrix to prove no regression.

### Storage and callables

- Storage: director reads an event file without membership; writes/deletes fail.
- Storage: missing/false/unapproved claim fails; director+PM writes only on the PM event.
- `assertCanReadEvent`: admin/director/member pass; outsider and revoked user fail.
- `getArtistDocumentContent`: director opens an event document without membership; cannot
  invoke event-document write callables.
- Admin callable: admin grant/revoke succeeds, preserves unrelated claims, mirrors and
  stamps the user document, and rejects non-admin/unauthenticated callers.
- `syncUserClaims`: returns/mirrors true and false director states without dropping other
  claims.

### Client and E2E

- Add a `director` emulator persona holding the claim and no memberships.
- AuthProvider handles callable result, cached-token fallback, sign-out reset, and account
  switch without leaking the prior identity's director state.
- `Viewer` predicates cover admin/director/PM/lead/tech and combined roles.
- `listEvents` returns every event for a director; membership-only consumers stay scoped.
- Shared membership summary preserves roles and powers the PM-only Tracker list.
- Navigation matrix: admin / director / PM / organizer / lead / tech, including unknown PM
  state resolving hidden.
- Gate both Tracker links and both Tracker routes from the same predicates.
- Director opens an unassigned event and its production, schedule, documents, advance, and
  Tracker screens with no edit controls.
- Director sees Team and Checklist read-only.
- Tracker page size and concurrency limits are unit-tested; “Load more” preserves ordering
  without duplicates.
- Query-key tests cover a membership-scoped user becoming or ceasing to be a director after
  claim refresh.

## Rollout and rollback

This crosses shared callable contracts plus Functions, Firestore rules, Storage rules, and
the externally deployed PWA. Ship in compatibility order:

1. Deploy Functions/contracts first. Old clients ignore the additional
   `isProductionDirector` response field; the new setter and read assertion now exist.
2. Deploy Firestore and Storage rules. With no claims granted yet, the broader branches are
   inert.
3. Release the PWA through the owner-managed Hosting process. New clients can safely depend
   on the already-deployed callable response and rules.
4. Only after the PWA release is verified, grant the first production-director claim and
   verify all-event listing, read-only controls, file reads, and Tracker pagination.

Functions/rules deploys require the workspace's explicit confirmation and health checks;
Hosting remains owner-managed. Record each backend deploy and Hosting checkpoint in
`planning/DEPLOYMENTS.md`.

Rollback order:

1. Revoke every production-director claim and allow for token propagation.
2. Roll back the PWA presentation if needed.
3. Roll back Storage/Firestore read branches.
4. The additive callable fields/setter may remain safely, or roll back Functions last.

## Consequences accepted deliberately

- **Data blast radius.** The claim permits reading every artist advance, production record,
  crew/event roster, schedule, booking, checklist, quote, flag, and event file. Grant it only
  to someone trusted with all of that data.
- **Token propagation window.** Claim revocation is not instantaneous for an already-issued
  direct-SDK token; approval revocation remains the broader emergency full-access path but
  is subject to the same documented token window.
- **Read cost.** Global oversight is inherently broader. Paging and bounded concurrency are
  mandatory so “read every event” does not mean “read every event at once.”
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
