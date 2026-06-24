# Phase 7 — PDF Packets (reports) — execution plan

The ROADMAP's "absolutely need" output (§7): a **server-generated, 46-branded PDF** that
compiles an event's **production record + artist advances** into a printable/shareable
packet, stored in Storage behind a **signed, expiring link**. Content is **tech-facing**
(the crew's working document), styled like 46's artist packets (memory `audience-internal-tech`).

> **Status: APPROVED — decisions locked 2026-06-24.** Large phase; built in slices.
> Branch `feature/phase-7-packets`, PR → `main`.

## Decisions (locked)
1. **Engine:** **@react-pdf/renderer** *(user)* — render React components → PDF buffer in
   a Cloud Function (no headless browser). Add `react` + `@react-pdf/renderer` to
   `functions/`; enable JSX in the functions build.
2. **First packet:** **full event** *(user)* — cover + event production record + each stage
   (stage production house package + its artist advances). Per-department + per-stage
   filters are follow-ups.
3. **Generation:** **Cloud Function `generatePacket(eventId)`** (admin or event member) —
   assembles data (Admin SDK), renders, uploads to `events/{id}/packets/{ts}.pdf`, returns
   a **signed URL** (default expiry **7 days**).
4. **Theme:** branded **cover** (dark bg + red diagonal slash + 46/event logos) + **content
   pages** (white, title-block header/footer with event/venue/dates + page numbers; section
   tables). Reuse brand tokens (`#0a0a0a`/`#f04040`); register a display font (fallback to a
   built-in if no TTF available — font fidelity is iterative).

## Data assembled (server-side)
event · event production record · stages (ordered) · per-stage production records · per-stage
artist advances (+ enabled departments for labels/section order). No new Firestore shape.

## Workstreams ([A] agent · [U] user)

### 7.1 PDF infra in functions  [A]
- Add deps + JSX build config; a `lib/pdf/` with `<Packet>` scaffolding + theme (colors,
  font registration, cover/page primitives). Minimal end-to-end render first.

### 7.2 Packet document  [A]
- Cover page; event production page (info + contacts + links); per-stage section (stage
  production house package by department; then each artist advance: artist info +
  additions/concerns/pending + per-department status/content). Tech-facing layout.

### 7.3 generatePacket function  [A]
- Callable: authorize (admin or member of the event); assemble data; `renderToBuffer`;
  upload to Storage; `getSignedUrl` (7-day); return `{ url }`.

### 7.4 UI  [A]
- "Generate packet" on the event detail → calls the function → opens/links the PDF
  (loading + error states). (Optional: keep a small list of recent packets — later.)

### 7.5 Storage/rules + verify + deploy  [A] → [U]
- Packets live under `events/{id}/packets/**` (already covered by storage.rules; signed URL
  gives read access). typecheck · lint · unit · rules · arch · build green; PR; deploy
  (functions + invoker). **stop for "ship it."**

## Out of scope (later)
Per-department + per-stage packet variants · stored packet history/versioning · quotes PDF
(Phase 8+, reuses this renderer) · gear inventory.

## Exit criteria
From an event, generate a branded full-event PDF (production + stages + artist advances)
that downloads via a signed expiring link; function authorizes by membership; CI green.
