# Phase 12 — Schedules — plan

ROADMAP §5 (Schedules) + §12 (push schedule items to the org-owned per-event calendar).
This is the structured schedule model deferred from Phase 11 ("no schedule data exists yet").

> **Status: 12a + 12b BUILT** — decisions locked 2026-06-24, expected to be refined repeatedly.

## Decisions (locked 2026-06-24)
- **Granularity:** event-level items with an **optional stage tag**.
- **Sections:** **all six** ship in 12a (production, show, travel, transportation, labor, custom).
- **Fields:** **specialized per section** (registry in `src/lib/schedules/sections.ts`).
- **Master output:** **screen-only** for 12a; PDF packet tie-in deferred.
- **Calendar-push (12b):** **auto-push on save**, **master-schedule items only** (`includeInMaster` + a time).

## 12b — as built
- `functions/src/googleSchedule.ts`: **`pushScheduleItem`** (client-orchestrated, caller's OAuth)
  reconciles one item with the event's Google calendar — create/update when in the master
  schedule with a start time, else remove; stores `googleCalendarEventId` on the item. Reuses
  11b's `ensureEventCalendar`/`authedClientForUser`. **`removeScheduleCalendarEvent`** for deletes.
  Graceful no-op when the caller hasn't connected Google (the save still succeeds).
- `EventScheduleScreen` fires the push after each create/update/master-toggle/delete; shows a
  connect-Google banner + an "on calendar" marker on synced items.

## 12a — as built
- Model: `src/lib/schedules/scheduleItem.ts` (+ `sections.ts` registry). Items at
  `events/{id}/scheduleItems/{id}`; common fields + per-section `fields` map; optional
  `stageId`/`advanceId`; `includeInMaster`. Times UTC, rendered/entered Central.
- Rules: member read, PM/admin write (+2 tests). Service: `schedule-service.ts`.
- UI: `EventScheduleScreen` (`/events/:id/schedule`) — **Edit** (section-aware authoring grouped
  by Central day) + **Master** (section toggles + per-item include/exclude). `ScheduleItemForm`
  is section-aware. Linked from the event page.

## Why now
- Phase 11b shipped the calendar/Meet plumbing (per-user OAuth, per-event Google calendar,
  Central-timezone discipline, UTC-safe storage). **Schedule-item calendar push reuses all of
  it** — so the only thing missing is the structured schedule data itself.
- Schedules are the highest-value day-of-show artifact (esp. on mobile) and feed PDF packets.

## Roadmap decisions this honors
- **Schedule sections:** Transportation · Production · Show · Travel · Stagehand-labor · Custom.
- **Master schedule (decided):** composite view that **toggles whole sections, with per-item
  include/exclude overrides**.
- **Times flow upward:** schedulable items (incl. transportation) carry times that aggregate
  into the master schedule.
- **Calendar (decided):** push schedule items to the event's org-owned Google calendar.
- **Timezone:** Central (`America/Chicago`), UTC-safe — reuse `src/lib/dates/timezone.ts`.
- **Mobile:** clean read/scroll day-of views; authoring is PWA-first.

## Data model (proposed)
Flat per-event collection, each item tagged with section + day (simple, queryable, aggregates
cleanly for the master view):

```
events/{eventId}/scheduleItems/{itemId}
  section:      'production' | 'show' | 'travel' | 'transportation' | 'labor' | 'custom'
  customLabel:  string | null         // section display name when section === 'custom'
  title:        string                // "Load-in", "Doors", "Set — Jelly Roll", "Truck A arrives"
  date:         Timestamp             // the festival day (UTC instant; rendered Central)
  startAt:      Timestamp             // UTC instant
  endAt:        Timestamp | null
  location:     string | null
  notes:        string | null
  stageId:      string | null         // optional: stage-scoped items (soundcheck/set) vs event-wide
  advanceId:    string | null         // optional link (e.g. a set time tied to an artist advance)
  crewCount:    number | null         // labor section
  includeInMaster: boolean            // per-item override (default true)
  googleCalendarEventId: string | null  // set when pushed to the event calendar (11b reuse)
  order:        number
  createdBy, createdAt, updatedAt
```
- **Times** are UTC instants; all display/entry goes through `timezone.ts` (Central).
- **Master schedule** = read all items, drop sections toggled off, drop items with
  `includeInMaster === false`, sort by `(date, startAt)`, group by day.
- Canonical model in `src/lib/schedules/scheduleItem.ts` (type + Zod + parser), service in
  `src/features/events/schedule-service.ts`. Rules: member read; PM/admin write (mirrors advances).

## Slices (shippable increments)
- **12a — Schedule authoring + master view** *(no calendar yet)*
  - Per-event schedule: add/edit/delete items per section, grouped by day; Central times.
  - Master schedule read-only view: section toggles + per-item include/exclude.
  - PM/admin write; member read. Rules + tests.
- **12b — Calendar push** *(reuses 11b)*
  - "Push to calendar" for selected schedule items → events on the event's Google calendar;
    store `googleCalendarEventId`. Update-on-edit + remove-on-delete. Optional background sync.
- **Deferred (later sub-phases):** richer Transportation modeling (legs/vehicles), Stagehand
  labor counts + Lasso integration (§8), PDF packet section for the master schedule (§7),
  DOS host-file export for artists (§ portal).

## Decisions needed before building
1. **Granularity:** items per **event**, with an optional **stage** tag (soundcheck/set are
   stage-specific; load-in/doors are event-wide)? *(Recommended: event-level + optional stageId.)*
2. **Which sections first?** *(Recommended 12a: Production + Show; add Travel/Transportation/Labor next.)*
3. **Per-section fields:** any required fields beyond title/time/location/notes (e.g. labor
   crew counts, travel flight #/hotel)? Start generic, specialize later?
4. **Master schedule output:** screen-only for 12a, or also feed the PDF packet (§7) now?
5. **Calendar push trigger (12b):** manual "Push" button, or auto-push on save (like the
   booking sync)?

## Exit criteria
- **12a:** create a multi-day event schedule across sections; the master view aggregates with
  section toggles + per-item overrides, times shown in Central.
- **12b:** push schedule items to the event's Google calendar; edits/deletes sync; links stored.
