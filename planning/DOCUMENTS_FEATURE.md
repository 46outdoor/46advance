# Artist & Event Documents — Feature Spec

Status: **feature-complete.** All five PRs shipped (categories #80; artist library +
Drive import; advance inclusion #116; event documents + uploads #117; packet embedding
+ obsolete-docs hiding), plus the twice-daily Drive sync (#118). Remaining threads
live in § Hardening backlog.

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
2. **Tech-access broker — already built (PR 2).** `getArtistDocumentContent` streams
   file bytes via the dedicated docs-broker service account
   `google-drive-viewer@advancethat.iam.gserviceaccount.com` (`DRIVE_SA_KEY` secret;
   the artist-docs folder is shared to it as Viewer), gated by app RBAC (approved
   users — matching the library's read rules). Google-native files export to PDF.
   This same SA read-path later feeds packet embedding (PR 5).
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
6. **Uploads land in PR 4** — both contexts. Event documents upload into the event's
   linked folder. Artist-library uploads target the artist's `sourceFolderId`, which
   the import callable now records (and merge-backfills onto existing docs on
   re-import — **run one re-import to enable library uploads**); the library root is
   recorded in `config/documentsLibrary` so a brand-new artist gets a subfolder
   created. Uploads run under the uploader's own `drive.file` token — the broker SA
   stays **Viewer** (no Content Manager needed; it only ever reads). PR 3 stays
   import/link-only.
7. **Artist-name normalization — conservative:** `artistKey` = lowercase → NFKD
   diacritic-strip → punctuation-strip → whitespace-collapse. No "feat."-clause
   splitting (a feat billing is usually a distinct act; wrongly merging entries is worse
   than a missed match). Unmatched-name hints in the UI can come later.

## Phasing

- **PR 1 — Categories** ✅ (#80): admin-managed category list (the 7 defaults + add/rename/remove).
- **PR 2 — Artist library + Drive import** ✅: `artistDocuments` model + service, folder-enabled
  Picker, `importDriveFolder` callable (per-artist subfolders → tagged docs), a top-level
  **Documents/Artists** list + per-artist document screen (list + classify). Rules.
- **PR 3 — Advance inclusion:** on an advance, list the library files for that artist
  (matched by `artistKey` — reusing PR 2's stored keys as-is) with checkboxes; included
  set displays on the advance (subcollection per decision 3, permissions per decision 4).
  Note: the tech-access broker (decision 2) turned out to already exist from the PR 2
  build-out — `getArtistDocumentContent` + `openArtistDocument` via the dedicated
  `google-drive-viewer@advancethat.iam.gserviceaccount.com` service account
  (`DRIVE_SA_KEY` secret) — so PR 3 reuses it unchanged; the artist-docs folder must be
  shared with THAT account (Viewer), not the functions runtime SA.
- **PR 4 — Event documents + uploads** ✅: event ↔ Drive folder linking in the event
  form (Picker, folder mode), client-direct multipart uploads into that folder via a
  short-lived `drive.file` token, the per-event documents view at
  `/events/:id/documents` grouped by schedule day (matching schedule days lend their
  color-coded headers; "Event-wide" last), per-doc re-day/categorize/remove, and the
  broker extended to serve event documents to that event's members (`{fileId, eventId}`).
  **Artist-library upload included:** `importDriveFolder` now records each file's
  `sourceFolderId` + the library root (`config/documentsLibrary`), merge-backfilling
  existing docs on re-import; the artist screen gains an upload panel (existing artist →
  their recorded folder; unbackfilled artist → prompted to re-import first, never a
  duplicate folder; new artist → subfolder created under the root). Library records
  from uploads are client-created under new admin/organizer rules (id = fileId,
  importedBy pinned). Failed record writes clean up the uploaded Drive file.
- **PR 5 — Packet embedding** ✅: the **"In packet"** toggle on included docs (advance
  editors) + `appendPacketAttachments` post-processing the rendered packet with pdf-lib:
  per artist, a divider page listing the attached docs, then PDF pages copied at native
  size/orientation and photos as LETTER pages fitted within 36pt margins (TBDs
  resolved). Google-native docs embed via their PDF export. 10 MB/file cap; oversized,
  unsupported, unreadable, or unfetchable files are LISTED on the divider with an
  open-in-app note — never silently dropped. Fetches ride the docs-broker SA;
  `generatePacket` gains the `DRIVE_SA_KEY` secret (1 GiB / 180 s).

## Drive sync (added 2026-07-18)

The library syncs FROM Drive on a schedule — `scheduledLibraryDriveSync`, **midnight +
noon Central daily** — enumerating the recorded root via the docs-broker SA (Viewer is
sufficient; no user OAuth). Files added to artist folders directly in Drive become
library records (unclassified) within a cycle; files deleted or moved out get a
**"Missing from Drive" flag** (never auto-deleted — a move is indistinguishable from a
delete; managers resolve flagged records by hand). Reappearing files clear the flag.
The manual Import button remains for immediate refreshes. Event-folder sweeping is NOT
included — event docs only enter via in-app upload for now.

## Open / TBD

- None — the PR 5 embedding details (photo sizing, PDF orientation, cap/fallback) are
  resolved in the PR 5 note above. Obsolete library docs are hidden from the advance
  inclusion list by default (a "Show N obsolete files" toggle reveals them; an obsolete
  doc that's already included stays visible), shipped with PR 5.

## Hardening backlog (accepted risks, revisit if the trust model changes)

- **Record registration is client-side** for trusted roles (admin/organizer for the
  library; admin/event-PM for event docs). In principle a trusted writer could register
  a fileId from another broker-visible folder, exposing it to that scope's readers. The
  broker only reaches folders deliberately shared with the viewer SA (whose content is
  app-visible by design), so this stays acceptable for an internal tool; server-side
  parentage validation (a create callable checking the file lives in the authorized
  folder) is the fix if the trust model widens.
- **No canonical artist→folder mapping.** The upload target comes from existing
  records' `sourceFolderId`; deleting an artist's last record then re-uploading can
  create a duplicate same-named Drive subfolder (cosmetic; merge by hand). A persisted
  `artistFolders/{artistKey}` map would close it.
