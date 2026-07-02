# Artist & Event Documents — Feature Spec

Status: **in build.** PR 1 (categories) merged-pending (#80). This doc is the living spec
for the rest; update it as decisions firm up.

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

## Phasing

- **PR 1 — Categories** ✅ (#80): admin-managed category list (the 7 defaults + add/rename/remove).
- **PR 2 — Artist library + Drive import** ✅: `artistDocuments` model + service, folder-enabled
  Picker, `importDriveFolder` callable (per-artist subfolders → tagged docs), a top-level
  **Documents/Artists** list + per-artist document screen (list + classify). Rules. (Upload new
  files *to* Drive deferred to a follow-up.)
- **PR 3 — Advance inclusion:** in an artist's advance, list the database files for that artist
  (matched by name) with checkboxes to include in the advance; show the included set on the
  advance + in the packet (TBD).
- **PR 4 — Event documents:** event ↔ Drive folder linking at create/edit, event uploads to that
  folder, the per-event documents view (by day).

## Open / TBD

- Exact "by day" grouping on the event view and how it relates to advance inclusion.
- Whether advance inclusion is a subcollection vs an array (concurrency).
- Whether included artist docs flow into the generated PDF packet.
- Artist name normalization rules (punctuation, "feat.", etc.).
