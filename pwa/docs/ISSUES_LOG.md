# Issues Log

Production incidents with root cause and resolution, newest first. Check here before
investigating a recurring problem (workspace rule: `../../AGENTS.md` § Issues Log).

## 2026-08-04 — Show days undeletable; `removeScheduleCalendarEvent` 504 stampede

**Symptom:** Deleting a schedule day hung indefinitely for show days (days whose items
had been pushed to Google Calendar) while bare days deleted fine. DevTools showed
hundreds→thousands of pending `removeScheduleCalendarEvent` requests and console CORS
errors (`No 'Access-Control-Allow-Origin' header`, `net::ERR_FAILED 503`).

**Root cause (two layers):**

1. **Client fan-out + blocking order.** `deleteScheduleDay` awaited one
   `removeScheduleCalendarEvent` callable **per pushed item, all concurrently**, before
   deleting the day doc. A full show-day grid meant dozens of simultaneous callables, and
   the day doc could not be deleted until every one settled.
2. **Server pile-up to the request timeout.** The concurrent calls contended on the same
   per-user rate-limit doc, the same user OAuth doc, and the same Google calendar. Requests
   stalled until Cloud Run's request timeout killed them — Cloud Logging showed waves of
   **504 "request has been terminated because it has reached the maximum request timeout"**
   (plus 503s under queue pressure). Infra-terminated responses carry no CORS headers, which
   is why the browser reported CORS errors; the underlying service was healthy (secrets OK,
   revision Ready). User retries multiplied the load.

**Resolution (client-side, no deploy):** `deleteScheduleDay` now deletes the doc first —
the delete is instant and never blocked by calendar IO — then removes the calendar events
in the background in sequential batches of 4 (`REMOVE_EVENTS_BATCH`), logging a warning if
any survive. Branch `fix/show-day-delete-calendar-hang`.

**Accepted trade-off:** background cleanup is not durable — closing the tab mid-cleanup
can leave events on the Google calendar (the same exposure a failed callable always had).

**Recommended follow-up (backend, needs deploy):** make the cascade durable and
single-request — either a `removeScheduleCalendarEvents` (plural) callable that deletes a
day's worth of event ids server-side, or an `onDocumentDeleted` trigger on
`events/{e}/scheduleDays/{day}` that sweeps the deleted doc's `googleCalendarEventId`s.
Either collapses N browser requests into one server operation with retry.
