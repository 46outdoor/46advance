# Artist & Event Documents — Feature Spec

Status: **in build.** PRs 1–2 shipped (categories #80; artist library + Drive import).
Open questions resolved 2026-07-18 (§ Decisions); next up: PR 3 (advance inclusion +
tech-access broker). This doc is the living spec; update it as decisions firm up.

## Goal

Bring the team's artist-document library (currently in a Google Drive folder) into the app,
classified by type, and make the right files easy to pull into each artist's advance on an
event. Two-way Drive: import existing files, and upload new ones back into the right folder.

## Contexts

1. **Artist documents (standalone library).** A top-level **Artists** list, independent of
   events. Each artist has a document screen showing their files, classified by category.
   Artists are identified by **name**, matched to the booked-artist names on advances
   (`advance.artistName`). Imported from a Drive folder whose **per-artist subfolders** name
   the artist.

2. **Advance inclusion (the bridge).** When an artist is on an event (an advance exists with
   that `artistName`), that artist's **advance** lists the database files for the artist with
   **checkboxes** to include specific ones in *that* advance. The advance's document set = the
   included artist files (+ any event-specific uploads).

3. **Event documents.** Each event links to its own **parent Drive folder** (chosen at event
   creation/edit). New documents uploaded for the event are stored in that folder and recorded.
   The event documents view organizes documents (e.g. by **day** of the event) — exact grouping
   TBD with the daily/advance views.

## Drive integration

- **Scope:** the app uses **`drive.file`** (per-file access to picked/created files) plus
  **`drive.metadata.readonly`** — the latter is needed to *list* an imported folder's contents
  (`drive.file` alone can't enumerate files the app didn't create); it's metadata-only, a much
  lower verification bar than `drive.readonly`. Still no broad-Drive file *content* read.
  The user **picks the folder** in the Google Picker (folder selection enabled), which grants
  the app access to that folder's tree; a server callable enumerates + imports.
- **Import (from Drive):** recurse the picked folder's per-artist subfolders → one document
  record per file, tagged with the artist (subfolder name). Files are **linked** (Drive refs:
  `fileId`, `name`, `mimeType`, `iconLink`, `webViewLink`), not copied. De-dupe by `fileId`.
- **Upload (to Drive):** a new file uploaded in the app is created in the corresponding Drive
  folder (artist subfolder for artist docs; the event's linked folder for event docs) via
  `drive.files.create`, then recorded. Client uploads directly to Drive with a short-lived
  `drive.file` token (`getDriveAccessToken`), mirroring the existing pattern.

## Permissions

- **Categories:** admin-only (PR 1).
- **Manage documents (import/upload/classify/include):** admin + organizer (the app's global
  elevated role — "PM" is per-event, not globally checkable in rules). Everyone approved views.

## Data model (proposed)

- `documentCategories/{id}` — **done** (PR 1).
- `artistDocuments/{id}` — the artist library. Fields: Drive ref (`fileId`, `name`, `mimeType`,
  `iconLink`, `webViewLink`), `artist` (display name), `artistKey` (normalized for matching),
  `categoryId | null`, `sourceFolderId`, `importedBy`, `importedAt`.
- **Advance inclusion** — included artist files per advance, e.g.
  `events/{e}/stages/{s}/advances/{a}/documents/{id}` referencing an `artistDocuments` id (+ a
  copy of the Drive ref + category for display), `addedBy`, `addedAt`. (Or an `includedDocIds`
  array on the advance — TBD by write-concurrency.)
- **Event ↔ Drive folder** — `event.driveFolderId` (+ name) set at creation/edit.
- **Event documents** — event-level uploads recorded under the event (`events/{e}/documents/{id}`),
  with `day` (date) for the daily grouping. Exact shape firmed up in PR 4.

Artist matching is by a **normalized name key** (lowercased, trimmed) shared between imported
subfolder names and `advance.artistName`.

## Decisions (2026-07-18)

1. **Packet inclusion — YES, embedded, selectively.** Included PDFs and photos are pulled
   INTO the generated advance packet (photos as image pages; PDFs merged in via pdf-lib —
   `@react-pdf/renderer` can't splice external PDFs), each behind a per-file
   **"include in packet"** toggle, separate from advance inclusion itself. The packet
   toggle ships *with* the embedding (PR 5) so it's never a dead control.
2. **Tech-access broker — in PR 3.** A `getArtistDocumentContent`-style callable streams
   file bytes via the functions runtime **service account** (the artist-docs Drive folder
   is shared to that SA as Viewer — no key management, ADC only), gated by app RBAC:
   any approved member of an event can open docs included on that event's advances;
   admin/organizer can open anything in the library. This same SA read-path later feeds
   packet embedding (PR 5).
3. **Advance inclusion shape — subcollection**, not an array:
   `events/{e}/stages/{s}/advances/{a}/documents/{docId}` with **docId = the
   `artistDocuments` id** (natural de-dupe; include/exclude = idempotent set/delete; no
   whole-array write races). Each doc copies the Drive ref + category label for display
   stability and carries `includePacket: boolean` (default false), `addedBy`, `addedAt`.
4. **Inclusion permissions follow advance-edit rights** (admin / event PM via
   `canEditEvent`), not the global manage-documents role — inclusion is per-event
   curation, not library management. Members read.
5. **Event documents key to the schedule's day model** (PR 4): the same `YYYY-MM-DD`
   date keys as `scheduleDays` (null = event-wide), grouped under the same color-coded
   day headers. One day concept app-wide.
6. **Uploads land in PR 4** with event documents; the artist library reuses that upload
   path. PR 3 stays import/link-only.
7. **Artist-name normalization — conservative:** `artistKey` = lowercase → NFKD
   diacritic-strip → punctuation-strip → whitespace-collapse. No "feat."-clause
   splitting (a feat billing is usually a distinct act; wrongly merging entries is worse
   than a missed match). Unmatched-name hints in the UI can come later.

## Phasing

- **PR 1 — Categories** ✅ (#80): admin-managed category list (the 7 defaults + add/rename/remove).
- **PR 2 — Artist library + Drive import** ✅: `artistDocuments` model + service, folder-enabled
  Picker, `importDriveFolder` callable (per-artist subfolders → tagged docs), a top-level
  **Documents/Artists** list + per-artist document screen (list + classify). Rules.
- **PR 3 — Advance inclusion + tech-access broker:** on an advance, list the library files
  for that artist (matched by `artistKey`) with checkboxes; included set displays on the
  advance (subcollection per decision 3, permissions per decision 4). The broker callable
  (decision 2) makes every included doc openable by the event's members regardless of
  their Drive permissions. **Prerequisite:** share the artist-docs Drive folder with the
  functions runtime service account (Viewer).
- **PR 4 — Event documents + uploads:** event ↔ Drive folder linking at create/edit,
  uploads to that folder (client-direct via `getDriveAccessToken`, mirroring PR 2's
  pattern), the per-event documents view grouped by schedule day (decision 5); artist
  library gains upload via the same path.
- **PR 5 — Packet embedding:** the `includePacket` toggle on included docs + embedding
  photos/PDFs into the generated packet via the SA read-path (decision 1). Size guard:
  cap embedded content (e.g. skip > ~10 MB per file with a listed link fallback).

## Open / TBD

- Packet embedding details (PR 5): page sizing for photos, orientation of merged PDF
  pages, and the size cap / fallback presentation.
