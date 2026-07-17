# Schedule Redesign — Day-Container Grid Model

> **Status:** Planning. Decisions below are agreed; items under "To verify" and
> "Open" are not. No existing schedule data needs to be preserved — this is a
> clean replacement, no migration.
>
> **Goal:** One consistent grid layout for schedules everywhere — the event
> schedule, the schedule template editor, and (later) the PDF packet — following
> the Miller Pro Advance model: each day is its own container card owning its
> items, rendered as a fixed-column table.

## Decisions log

| # | Decision |
| - | -------- |
| 1 | `section` is renamed to `type`; the concept is otherwise the same (category tag + behavior switch + filter axis). Taxonomy revised below. |
| 2 | Days become first-class, fully manual containers (add / remove / date / type / title / description / notes) — not derived from item timestamps or event load-in/out counts. |
| 3 | Grid columns: **Start \| End \| Duration \| Type \| Item \| Description**. Duration is always derived, never stored. Type renders as a small color icon/dot **with a tooltip naming the type** (the custom type's tooltip shows its user-named label). |
| 4 | Item `notes` is replaced by `description` (the grid column). |
| 5 | The existing per-day notes mechanism (`scheduleNotes` docs: master note + note per section) is removed. The day container's single small `notes` field replaces it. Nothing to preserve. |
| 6 | Edit model matches MPA: a global Edit toggle with inline editing in the grid. The separate per-row form goes away. |
| 7 | Day types and item types are **separate taxonomies**. Day types: **Travel, Load In, Show, Load Out, Off Day** (MPA's list minus Build/Rehearsal/Strike), with a **muted palette** complementary to the 46 brand — same semantic arc (warm amber for load-in, green for show, red for load-out). Item types get their own colors, shown as the type icon and in a key at the bottom of the schedule. |
| 8 | The key/legend reflects the current filter — only types with visible items appear in it. |
| 9 | Filters replace the Edit/Master view split: filter by day, type, stage (and future modifiers). "Master schedule" = the grid with no filters. |
| 10 | `includeInMaster` is replaced by a per-item **`pushToCalendar`** flag, which is what the Google Calendar auto-push keys on. |
| 11 | The Show slot→advance link is removed in favor of **placeholders**: `{artist 1}` in an Item/Description resolves to the artist booked in slot 1 on the item's stage. |
| 12 | Per-type detail fields (flight #, driver, quantity, …) are *not* sub-types — they are fields that appear based on the selected type, and display as an extra description row under the item when populated. |
| 13 | Sub-types are the *filterable* modifiers — Stage is the first one ("main stage production" = type Production + stage Main). |
| 14 | Master template: a template that composes other templates by reference and can be auto-inserted when creating a new event. Composition merges days **by offset**. |
| 15 | Show items have **no Location field** — stage (sub-type) covers the where. |
| 16 | Labor items get **crew lines**: a repeating `{type, quantity, duration}` group. One schedule item (e.g. "Show Call") lists one line per crew type — "(12) Stagehands · 8h", "(4) Riggers · 4h". The crew type (Stagehands, Riggers, …) moves off the Item text into these lines. |
| 17 | Labor **Duration column stays blank when crew lines have differing durations** — the per-line durations are the truth; a single item-level number would be misleading. When all lines share one duration (or there's a single line), the column may show it. |
| 18 | `pushToCalendar` **defaults on** for new items (matches today's `includeInMaster` default). |
| 19 | Production's "Kind" select is **dropped** — the Item text carries it. |
| 20 | Location is **free text with autocomplete** from locations already used in this event's schedule. |
| 21 | Crew types are an **admin-editable config** (e.g. `config/crewTypes`, following the departments/branding config pattern), seeded with Stagehands, Riggers / Climbers, Fork / Lull Operators. Config model lands in PR 1; the admin edit screen in PR 3. |
| 22 | Template import **merges into an existing day** when a resolved day lands on a date that already has a card — the event day keeps its own title/type/notes; template day metadata applies only when the import creates the day. |
| 23 | **Event template wins** over the default master template: if the event is created from an event template that names schedule templates, only those apply; the default master template applies only when no event template supplies schedules. |
| 24 | **One day card per calendar date** — enforced structurally by making the day doc id the date key (`YYYY-MM-DD`). A single-day event uses one card; its items carry their own types. |
| 25 | A **bulk "shift all days ±N days" action** ships with the grid (PR 2) so a slipped event moves in one step. |

## Taxonomy tree

Ordering, naming, and colors below are a **seed for review** — reorder/rename
freely; this is the document to mark up.

```text
SCHEDULE
│
├─ DAY (container card — header color = day type)
│   ├─ type ........... colors the header (muted seed palette, see below)
│   │     ■ Travel      #5c6b8a  muted slate blue
│   │     ■ Load In     #b3822f  muted amber
│   │     ■ Show        #4a7c59  muted forest green
│   │     ■ Load Out    #944040  muted deep red
│   │     ■ Off Day     #6f6f76  muted gray
│   ├─ date ............ actual date (event) / relative offset (template)
│   ├─ title ........... free text, e.g. "Stage Build Day 1 + Pre Rig"
│   ├─ description ..... short text shown inline in the header
│   ├─ notes ........... small free-text field under the header
│   └─ items[] ......... the grid rows
│
└─ ITEM  (row: Start | End | Duration | Type | Item | Description)
    │
    ├─ ● Production  #557a95 muted steel blue
    │   ├─ sub-types:  Stage
    │   └─ fields:     Location
    │
    ├─ ● Show  #4a7c59 forest green (shares the Show day hue)
    │   ├─ sub-types:  Stage
    │   └─ placeholders: {artist N} in Item/Description → artist booked
    │                    in slot N on this item's stage
    │                    (no Location — the stage is the where)
    │
    ├─ ● Travel  #7d6ba0 muted violet
    │   └─ fields:     Who / party, Mode (Flight | Drive | Train | Other),
    │                  Carrier, Flight / Conf #, From, To
    │
    ├─ ● Transportation  #4f7d78 muted teal
    │   └─ fields:     Vehicle, Driver, Pickup location, Drop-off location
    │
    ├─ ● Labor  #8a5a83 muted plum
    │   ├─ sub-types:  Stage
    │   ├─ fields:     Location
    │   └─ crew lines: repeating {type, quantity, duration} — one line per
    │                  crew type on a single item. Item = the call name
    │                  ("Show Call", "Load-In Call"); lines render as
    │                  "(12) Stagehands · 8h" / "(4) Riggers · 4h".
    │                  Types seeded: Stagehands, Riggers / Climbers,
    │                  Fork / Lull Operators (source of list: see Open)
    │
    └─ ● Custom  #6f6f76 muted gray
        └─ label:      free text (user-named type)
```

Notes on the tree:

- **Per-type fields** render as a second, muted row under the item ("Carrier:
  Delta · Conf #: ABC123") only when populated. They are edited in the inline
  row's expanded state.
- The old Production "Kind" select (Load-in / Soundcheck / Doors / Load-out /
  Other) is dropped — with Item as free text it was redundant. Flag if wanted back.
- **Day types trimmed from MPA's list:** Build, Rehearsal, and Strike are
  dropped — the working set is Travel, Load In, Show, Load Out, Off Day.
- **Day palette rationale:** deliberately more muted than MPA's saturated hues,
  tuned to sit alongside the 46 brand (dark chrome, brand red `#f04040` reserved
  as accent) while keeping the semantic arc — warm amber for Load In, green for
  Show, red for Load Out. Load Out is kept desaturated and deep so it never
  reads as the brand accent. White text on all five. Values are seeds — final
  pass validates contrast in both themes.
- **Colors approved 2026-07-12** as the working set (both palettes), in the
  same muted register, distinct from the brand red accent; defined as tokens,
  contrast-validated in light + dark during PR 2. Visual preview (day swatches,
  mock day card, taxonomy tree): the "Schedule Redesign — Palette & Taxonomy"
  artifact.
- **Type icon tooltip:** every type dot carries a tooltip naming the type —
  hover on desktop, and given PWA/touch use, the icon needs a touch-reachable
  equivalent (e.g. tap toggles the tooltip); plus the always-visible key at the
  bottom of the schedule.
- The **key/legend** row at the bottom of every schedule lists `● Type` pairs
  for the types currently visible under active filters.

## Data model

### Event schedule

`events/{eventId}/scheduleDays/{dayId}` — one doc per day, **items embedded**
(MPA model; a day's schedule fits far under the 1 MB doc cap, and inline editing
saves the whole day atomically):

```ts
interface ScheduleDay {
  id: string;                // doc id = the date key ('YYYY-MM-DD') — one card per date
  date: string;              // 'YYYY-MM-DD' wall-clock day in the event's timezone
  dayType: DayType;          // header color
  title: string | null;
  description: string | null;
  notes: string | null;
  items: ScheduleItem[];
  createdBy: string; createdAt; updatedAt;
}

interface ScheduleItem {
  id: string;
  type: ItemType;            // renamed from `section`
  customLabel: string | null;      // when type === 'custom'
  startTime: string | null;  // 'HH:mm' wall-clock in the event's timezone
  endTime: string | null;
  endEstimated: boolean;
  item: string;              // renamed from `title`; may contain {artist N}
  description: string | null;      // replaces `notes`
  stageId: string | null;    // sub-type modifier
  fields: Record<string, string>;  // flat per-type fields (registry-driven, as today)
  crew: CrewLine[];          // labor only — one line per crew type on the call
  pushToCalendar: boolean;   // replaces includeInMaster
  googleCalendarEventId: string | null;
}

/** Labor crew line: "(12) Stagehands · 8h". `hours` is this type's call length,
 * independent of the item's overall start/end window. */
interface CrewLine {
  type: string;              // Stagehands, Riggers / Climbers, Fork / Lull Operators, …
  quantity: number;
  hours: number | null;
}
```

Items render sorted by `startTime` (untimed last); ties keep the embedded
array's order, so array position is the tie-break and items need no `order`
field. Days sort by `date`; uniqueness per date is structural (the doc id is
the date key). Re-dating a day = a delete + create under the new key (the
service wraps this, carrying `googleCalendarEventId`s across and
re-reconciling pushed items).

Key change from today: items store **wall-clock times + a day date** instead of
UTC instants. This makes event items and template items nearly identical, kills
the group-by-derived-day logic, and the calendar push derives UTC instants from
`day.date + item.startTime` in the event's timezone (existing helpers in
`src/lib/dates/timezone.ts` cover this). Overnight rows (end < start) roll to the
next day at instant-derivation time, as the current form already does.

### Registries

- `src/lib/schedules/types.ts` (evolves `sections.ts`): item types with label,
  **color token**, sub-type applicability, per-type field defs. Same
  registry-driven pattern as today.
- `dayTypes.ts`: the day-type list + colors above.

### Templates

`scheduleTemplates/{id}` keeps its shape but days gain the same metadata and the
items match the event item shape (already wall-clock; `stageName` still matches
by name on import):

```ts
interface ScheduleTemplateDay {
  offset: number;            // relative day (negative = load-in)
  dayType: DayType;
  title: string | null;
  description: string | null;
  notes: string | null;
  items: ScheduleTemplateItem[];   // moves inside the day (day owns items)
}
```

**Master template:** a template with `kind: 'master'` holding an ordered list of
references to other schedule templates (plus optional inline days/items). One
master template can be flagged `isDefault`; creating a new event auto-inserts it.
On insert, referenced templates resolve recursively (one level deep) and their
days **merge by offset** — every template's "Load-in 2" items land in the same
day container, with day metadata taken from the first template that defines that
offset (later ones only contribute items).

**Import into an existing schedule** follows the same merge discipline: a
resolved day landing on a date that already has a card merges its items into
that card (decision 22) — required anyway, since one card per date is
structural. **Precedence on event creation:** an event template's explicit
schedule-template references win; the default master template applies only
when no event template supplies schedules (decision 23).

### Removed

- `events/{eventId}/scheduleItems` collection (replaced by embedded day items)
- `events/{eventId}/scheduleNotes` collection + `ScheduleDayNotes.tsx`
- `includeInMaster`, `advanceId` (legacy), `slot` (replaced by placeholders)
- The Edit/Master view split, per-section master toggles, `ScheduleItemForm` /
  `ScheduleTemplateItemForm` (replaced by inline grid editing)
- Firestore rules for the removed collections; new rules for `scheduleDays`

## UI

One shared **`ScheduleDayCard`** (in `src/components/schedules/`) used by the
event schedule screen and the template editor:

- Color-coded header: day type + title, date (or relative-day label in
  templates), description inline; notes line under the header.
- Table: `Start | End | Duration | Type | Item | Description` with fixed column
  widths shared across all cards so columns align vertically down the page;
  rows sorted by start time (untimed last). The type dot has a tooltip naming
  the type (touch-reachable, not hover-only). Per-type fields render as a muted
  second row when populated. Duration is derived from start/end — except labor
  items whose crew lines have differing durations, where the column stays blank
  and the per-line durations carry the information.
- Crew lines render as their own aligned mini-grid under the item —
  `Qty | Crew type | Duration` with fixed column widths shared across all lines
  (quantity right-aligned, tabular numerals), not free-flowing text.
- **View mode:** read-only rows; placeholders resolved to artist names.
- **Edit mode (global toggle):** inline inputs per cell — time inputs, type
  select (drives which per-type fields appear in the row's expanded area), stage
  select, text inputs; "+ Add item" per day; add/remove/edit day controls.
  Saves per-day (whole-doc write), debounced or on blur.
- **Filter bar** above the cards: day, type, stage. The legend at the bottom
  shows the color key for visible types. **Filter state lives in the URL**
  (query params) so a filtered view — one stage's day, labor only — is
  shareable and bookmarkable.
- Small screens: rows wrap for display (as the template editor does today)
  rather than horizontal scroll. Inline cell editing doesn't translate to
  touch — on phones the row swaps to an expanded stacked editor; exact
  treatment lands with PR 2 (techs work from phones).

### Placeholders

`{artist N}` in Item or Description resolves at render time to the artist whose
advance holds slot N on the item's stage (same lookup the schedule screen uses
today). Unresolved (no stage set, or slot unbooked) renders the slot label, e.g.
"Slot 1", as the current slot feature does. Calendar push and PDF export resolve
placeholders before sending.

### Calendar push

Same reconcile mechanics (`functions/src/googleSchedule.ts`), adapted to
embedded items:

- Trigger flag is `pushToCalendar` (defaults on — decision 18).
- Instants derived from day date + wall-clock times in the event's timezone.
- Item text pushed with placeholders resolved.
- The callable addresses an item as `eventId + dayId + itemId` and writes
  `googleCalendarEventId` back into the day doc **in a transaction** (locate
  the entry by id, rewrite just that entry) so it can't clobber a concurrent
  client save of the whole day.
- Changing a day's **date** (or the event's timezone) re-reconciles every
  pushed item in that day — all their instants moved.
- Deleting an item removes its calendar event; deleting a **day** removes the
  calendar events of all its pushed items.
- Contract shapes ripple to `functions/src/contracts/callables/schedules.ts`
  (`@contracts`); mobile isn't built, so no cross-app coordination beyond the
  shared functions.

## Suggested PR sequence

1. **Model + registries + rules** — `scheduleDays` model (event + template),
   type/dayType registries with colors, the `config/crewTypes` config model
   (seeded), Firestore rules, delete the old models/collections' code paths
   behind the new service layer. Unit tests on parsers/helpers +
   firestore-rules tests for the new collections. Rewrite the stagehand labor
   seed (`scheduleTemplateSeed.ts` / seed script) to the crew-lines shape.
2. **Shared grid** — `ScheduleDayCard` + inline edit; rebuild
   `EventScheduleScreen` on it (filters, legend, edit toggle, placeholders),
   plus the bulk "shift all days ±N days" action.
3. **Template editor on the grid** + master-template composition + auto-insert
   on event creation + the crew-types admin edit screen.
4. **Calendar push rework** (`pushToCalendar`, wall-clock→instant derivation,
   placeholder resolution, transactional write-back, day-date-change
   re-reconcile, delete cascades) + contract updates in
   `functions/src/contracts/callables/schedules.ts` with emulator handler
   tests + PDF/packet alignment if applicable.
5. **Cleanup sweep** — remove dead code (old forms, notes UI, master view),
   docs/CHANGELOG/AGENTS canonical-sources table updates.

## To verify (flagged for testing)

- [ ] Master-template **merge-by-offset** is the desired behavior once used in
      practice (vs. append-days-per-template). Revisit after first real use.
- [ ] Inline-edit save granularity (on blur per field vs. explicit day save)
      feels right in practice.
- [ ] Concurrent-edit blast radius: day docs are whole-doc writes
      (last-write-wins per day, vs. per-item docs today). If two editors
      collide in practice, add an `updatedAt` precondition or per-item merge
      on save — decide in PR 2.
- [ ] Day-type palette works with the 46 brand theme in both light and dark.

## Open

- PDF packet schedule rendering — confirm scope when PR 4 lands.
