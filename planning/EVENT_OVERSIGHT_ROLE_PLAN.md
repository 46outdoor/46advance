# Production director — cross-event oversight

**Decided 2026-08-09. Not yet built.**

A production director oversees the PMs' work across the whole application. They **may or may
not** be assigned as a PM on any given event, so their access cannot be derived from event
membership — this is the app's first genuinely global, non-admin capability.

Decision: **widen the Firestore read rules** so the role can read any event in the
application. The two alternatives considered — auto-enrolling the director as a member of
every event, and computing tracker roll-ups server-side — are recorded in
[Alternatives](#alternatives-considered) with why they lost.

> **This amends a core RBAC decision.** ROADMAP §4 states *"roles are granted PER
> ADVANCE/EVENT, not globally. A user is not assigned one universal role."* This role is the
> first deliberate exception. The amendment is recorded in ROADMAP §4 rather than only here,
> so the exception is visible where the rule is stated.

---

## Why the rules are the whole problem

The UI is the easy part. Today every read in the event subtree is gated on membership:

| Path | Current read rule |
| --- | --- |
| `events/{eventId}` | `isAdmin() \|\| isMember(eventId)` |
| `events/{eventId}/stages/{stageId}` | `isAdmin() \|\| isMember(eventId)` |
| `…/stages/{stageId}/advances/{advanceId}` | `isAdmin() \|\| isMember(eventId)` |
| `events/{eventId}/production/{recordId}` | `isAdmin() \|\| isMember(eventId)` |
| `events/{eventId}/contacts/{attachId}` | `isAdmin() \|\| isMember(eventId)` |
| `events/{eventId}/checklist/{itemId}` | **PM-only** (`canEditEvent`) |

`isOrganizer()` appears in **none** of them. A director who isn't a member gets
permission-denied on every event they don't belong to, no matter what the navigation shows.
Oversight-without-assignment is impossible at the data layer today — hiding or showing links
changes nothing.

## The capability

**Read-only, application-wide, over events.** Explicitly *not* granted:

- **No writes anywhere.** Oversight is the authority to see the work, not to change it. A
  director who needs to edit a specific show should be assigned PM on that show. This is
  easy to widen later and painful to narrow, so it starts closed.
- **No admin functions** — no user approval, no role granting, no branding, no deletes.
  Oversight is not system administration.

### Which claim

**Add a distinct `productionDirector` claim.** Do not reuse `organizer`.

Reusing `organizer` is tempting and cheaper — the same one or two people hold it today. It
is rejected because **the Admin screen's Organizer toggle is the safety mechanism**: a human
reads that label and decides whether to grant it. Today it means "may create events and
curate the document library." Silently turning it into "may read every event in the
application" makes the label lie at exactly the moment someone is deciding who gets it.

The cost is low because the pattern already exists and is proven: `setUserOrganizer`
(`functions/src/index.ts:348-360`) is an admin-only callable that sets a custom claim and
mirrors it to `users/{uid}`. `setUserProductionDirector` is that function with one word
changed.

**Regardless of the claim, name the predicates for the capability, not the person.** Define
`canOverseeAllEvents()` separately from `canCreateEvents()`, even though the populations
overlap. If they ever diverge, that's one predicate body instead of a sweep of call sites.

## Rules change

Nearly every rule in the event subtree already shares one shape, so the change is mechanical
and reviewable. Introduce two helpers next to the existing ones
(`pwa/firestore.rules:39-58`):

```
function canOverseeAllEvents() {
  return isActiveUser() && request.auth.token.productionDirector == true;
}

function canReadEvent(eventId) {
  return isAdmin() || canOverseeAllEvents() || isMember(eventId);
}
```

Then replace `isAdmin() || isMember(eventId)` with `canReadEvent(eventId)` throughout the
event subtree. Write rules (`canEditEvent`, the department-lead branches) are untouched —
that is what keeps this read-only.

**Do not** add the claim to the `/{path=**}/members/{memberUid}` collectionGroup rule
(`firestore.rules:259-261`). That rule is deliberately self-only and is what makes the
"which events am I on" query safe; a director reads member rows through the per-event
`members` rule instead.

### Open sub-decision: the checklist

`events/{eventId}/checklist/{itemId}` is the one event surface that is **PM-only even for
members**. It's a PM's working list. Two defensible answers:

- **Include it** — it is literally the PM's task list, so it is the most direct view of "is
  the PM on top of this show."
- **Leave it** — it's a private scratchpad, and oversight is about deliverables.

Not decided. Everything else in the subtree follows `canReadEvent`.

## Client changes

The rules are necessary but not sufficient — three client paths hard-code `isAdmin` as the
only way to see beyond your own memberships:

- **`src/lib/events/events-read.ts:38`** — `listEvents` branches on `viewer.isAdmin` for the
  all-events path. A director must take the same branch, or they still only see events
  they're assigned to and can't navigate to the rest.
- **`src/lib/tracker/tracker-service.ts:80`** — `listVisibleEvents` has the same
  admin-or-membership branch. Same change.
- **`src/contexts/AuthProvider.tsx` + `src/contexts/auth-context.ts:10`** — carry
  `isProductionDirector` alongside `isAdmin`/`isOrganizer`, resolved from the claim.

### Tracker scoping, finalised

With the tier in place, the tracker rules that have moved twice settle as:

| Viewer | Tracker nav | Tracker overview lists |
| --- | --- | --- |
| Admin | visible | every event |
| Production director | visible | every event |
| PM on ≥1 event | visible | only events where they are PM |
| Department lead, tech | **hidden** | — |

The PM row is the only one needing derivation: "is PM on at least one event" comes from the
`collectionGroup('members')` query the app already runs (and already discards the role from)
in both files above. `canEditEvent(viewer, role) = isAdmin || role === 'production-manager'`
(`src/lib/rbac/permissions.ts:42`) is already exactly the per-event predicate.

Because the PM case resolves asynchronously while admin/director are synchronous from auth
state, the nav needs an explicit unknown-state policy: **treat unresolved as not-visible**,
so a link never flashes in and then disappears.

> **⚠ Gating the nav is not enough.** The Events screen renders an **ungated** Tracker link
> (`src/features/events/EventsListScreen.tsx:208`), so a tech would keep a one-click route to
> a tracker we just hid. In-app links must honour the same policy as the navigation. The same
> defect exists on the Crew panel's "Manage directory →" link
> (`src/features/events/EventContactsPanel.tsx:193`), which is unguarded while
> [PWA_MOBILE_NAV_PLAN.md](PWA_MOBILE_NAV_PLAN.md) hides Contacts from non-organizers.

## Consequences worth accepting deliberately

- **Blast radius.** This grants read access to every artist's advance content, every
  production record, every crew roster, and every schedule across every festival — not just
  completion status. That is the trade for the simplicity of a rules change, and it is the
  right trade only if the director is someone you'd trust with all of it anyway.
- **Unbounded read.** `listVisibleEvents` takes `getDocs(collection(db,'events'))` with **no
  cap** on the admin path (`tracker-service.ts:82`), unlike `listEvents`, which caps at
  `EVENTS_READ_CAP` (500) and warns. Directors now take that uncapped path; worth capping it
  the same way while in there.
- **Interaction with [IDEAS §5](IDEAS.md).** That entry proposes tightening `contacts` and
  `artistDocuments` from "any approved user" to organizer/admin. Whenever it happens, the
  director tier belongs in the permitted set — otherwise oversight can read every event but
  not the contacts directory.

## Tests

Rules tests are the load-bearing ones here; `pwa/test/firestore.rules.test.ts` already covers
this subtree densely per role.

- Add a `director` persona (`tests/emulator/personas.ts`) holding the claim and **no event
  memberships** — the whole point is access without assignment.
- Assert **read allowed** across the subtree for an event they are not a member of: event,
  stages, advances, production records, contacts, scheduleDays.
- Assert **every write denied** on that same event — this is the guard that keeps the role
  read-only, and it should be exhaustive rather than a spot check.
- Assert the checklist behaves per the sub-decision above.
- Assert the director **cannot** read other users' rows via the members collectionGroup rule.
- Client: `listEvents` and `listVisibleEvents` return all events for a director with no
  memberships; the tracker overview lists all events for a director and only PM events for a
  PM; the nav matrix across admin / director / PM / lead / tech.

## Alternatives considered

- **Auto-enrol the director as a member of every event.** No rules change, and membership
  stays the single source of truth with a per-event audit trail. Rejected for bookkeeping
  (every new event needs enrolling, every new director backfilling across all events) and
  semantic drift — membership would mean both "works this show" and "oversees this show,"
  and the Team & access roster would list people who aren't on the show.
- **Server-side tracker aggregation.** A callable computes roll-ups with the Admin SDK gated
  on the claim, so the director sees *progress* without gaining read access to *content* —
  the tightest fit for the stated need, since the tracker is status data. Rejected as more
  machinery than warranted given the director is trusted with the underlying data anyway.
  Worth revisiting if the tier is ever extended to someone who shouldn't read advance
  contents.
