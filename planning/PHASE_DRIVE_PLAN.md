# Phase 13 — Google Drive — plan

ROADMAP §12 (Integrations → Google Drive). Targets (decided): **attach/link Drive
files to advances**, **store generated packets in Drive**, **source template content
from Drive**. (Sheets/Docs export explicitly out.) Builds directly on Phase 11b's
per-user Google OAuth.

> **Status: PROPOSED — plan only.** Scope + build decisions resolved 2026-06-25; awaiting
> approval to implement. No code yet.

## Decisions (locked 2026-06-25)
- **Auth:** reuse 11b per-user OAuth — no new OAuth flow, token store, or refresh logic.
- **Scope:** Google **`drive.file`** + the **Google Picker** (least privilege: the app
  only sees files it creates or the user explicitly picks). **Not** broad `drive` /
  `drive.readonly` (those are *restricted* scopes that trigger a heavy Google security
  assessment; `drive.file` does not).
- **Slice order:** **13a** attach/link files → **13b** save packet to Drive. **13c**
  (source template content) is **deferred** to a later phase.
- **Link flow:** a **server-side `linkDriveFile` callable** validates access via
  `drive.files.get` and stores Google's canonical metadata — the client never writes raw
  Drive data (prevents spoofed links).
- **Storage shape:** `driveFiles` as an **array field on the advance** (mirrors
  `links`/`contacts`), not a subcollection.
- **Save-to-Drive:** a **separate `savePacketToDrive` callable**, not a flag on
  `generatePacket`.
- **Cross-user access:** first cut = an inline "opens in the linker's Drive" note **plus**
  UI copy steering users to an org **Shared Drive**; auto-share is a possible later add.
- **Slack: deferred** — revisit model (notifications-bot vs per-user OAuth) after Drive.

## What's reused (from 11b — minimal new OAuth work)
The OAuth platform in `functions/src/google.ts` carries over as-is:
- `authedClientForUser(db, uid)` — token load + auto-refresh persistence.
- `googleAuthUrl` / `googleAuthCallback` / `googleDisconnect`, `googleTokens/{uid}`
  (server-only), `googleConnections/{uid}` (status mirror, records granted `scopes`).
- Client `useGoogleConnection`, `google-service.ts`, and the existing connect UI.

**The only change to shared OAuth:** add `drive.file` to `SCOPES` (`google.ts:34`).
`prompt: 'consent'` already forces re-consent, so already-connected users re-connect
once to grant Drive. Gate Drive UI on the Drive scope being present in
`googleConnections.scopes` (don't assume a Calendar connection includes Drive).

## 13a — Attach / link Drive files to an advance
- **Picker (client):** load the Google Picker authorized with the user's access token;
  user selects existing Drive files (or uploads). Under `drive.file`, the selection
  grants the app per-file access. The Picker returns the selected `fileId`(s), which the
  client hands to the `linkDriveFile` callable below — the client does **not** write Drive
  metadata directly.
- **Link (server):** `linkDriveFile({ eventId, stageId, advanceId, fileId })` validates
  the caller can edit the event (`assertCanEditEvent`), calls `drive.files.get` with the
  user's client to **confirm access and capture canonical metadata** (name, mimeType,
  `webViewLink`, `iconLink`), then appends the `DriveFileRef` to the advance via the Admin
  SDK. Keeps the stored link trustworthy — always a real `drive.google.com` URL, no
  spoofing. `removeDriveFile` deletes an entry.
- **Model:** `driveFiles: DriveFileRef[]` (array field) on
  `events/{eventId}/stages/{stageId}/advances/{advanceId}` — mirrors `links`/`contacts`
  on production records:
  ```ts
  interface DriveFileRef {
    fileId: string;
    name: string;
    mimeType: string;
    iconLink: string | null;
    webViewLink: string;          // canonical Google link; opening depends on viewer's access
    linkedByUid: string;
    linkedByEmail: string | null;
    linkedAt: Timestamp;
  }
  ```
  Canonical type in `src/lib/google/` (Zod parser). Written only by the callables (Admin
  SDK) — not client-writable; see Security.
- **UI:** `DriveFilesEditor` on the advance screen, mirroring `AttachmentsEditor`
  (`src/features/events/AttachmentsEditor.tsx`) — list with name + open-in-Drive + remove;
  an "Attach from Drive" button gated on the Drive scope (else a connect prompt).
- **Per-user access (decided):** a file linked by user A may be inaccessible to user B
  (it lives in A's Drive). We persist the canonical `webViewLink` so the link always
  shows; opening depends on the viewer's own access. **First cut:** an inline "opens in
  the linker's Drive" note on each file **plus** UI copy steering users to link from an
  **org Shared Drive** (files there aren't personal-access). **Auto-share** (linker's
  client calls `drive.permissions.create` to share with event members) is a **possible
  later add**, not in this phase.

## 13b — Save generated packet to Drive
- After `generatePacket` renders the buffer (`functions/src/index.ts:334`) and saves the
  Storage copy (unchanged), a **separate `savePacketToDrive({ eventId, path })` callable**
  uploads that packet to the caller's Drive via `drive.files.create` (media upload) into
  an app folder (`46 Advance / {event name}`), using `authedClientForUser`. Returns the
  `webViewLink`. A separate callable (vs a `toDrive` flag) keeps `generatePacket`
  single-purpose and lets users opt in after generating.
- **Graceful no-op** when the caller hasn't connected Google / granted Drive (mirrors the
  schedule-push pattern) — the Storage packet + signed link still work.

## 13c — Source template content from Drive — DEFERRED
**Deferred to a later phase** (decided 2026-06-25). Most complex; touches templates
(`src/lib/templates/`, `templates-service.ts`), and without Docs/Sheets parsing (out of
scope) it reduces to "link reference files on a template" — modest value. Revisit once
13a/13b are proven.

## Backend
- New `functions/src/googleDrive.ts` (mirrors `googleSchedule.ts` / `googleBookings.ts`):
  `linkDriveFile`, `removeDriveFile`, `savePacketToDrive` — all reuse `authedClientForUser`,
  `assertCanEditEvent`, `OAUTH_SECRETS`.
- Wire exports alongside the existing google functions.
- **Rate-limit** the Drive callables with `checkFirestoreRateLimit()` (security rule).

## Client
- `src/lib/google/drive-service.ts` (callable wrappers + Picker helper) + a `useDriveFiles`
  React Query hook.
- **Picker loader** needs a Google Cloud **API key / app id** (separate from the OAuth
  client; non-secret, HTTP-referrer-restricted) + the user's OAuth access token. Put the
  key in `src/config/integrations.ts` (create on first use — canonical table) alongside
  the project number.
- UI: `DriveFilesEditor` (advance) + a "Save to Drive" action on the packet UI.

## Security / rules
- `driveFiles` is written **only by the `linkDriveFile` / `removeDriveFile` callables**
  (Admin SDK); `firestore.rules` should reject client writes to the field so stored links
  stay server-validated. Members still **read** it with the advance.
- `drive.file` keeps server access scoped to app-touched files only.
- No new Functions secrets; the Picker API key is non-secret (referrer-restricted), can
  live in env like the Firebase web config.

## OAuth verification impact
`drive.file` is a **non-restricted (recommended)** scope — it does **not** trigger the
restricted-scope CASA assessment that broad `drive` would. It is still **sensitive** (adds
to the consent screen), so the pending verification submission must list Drive, but the
tier is unchanged. Fold into the verification checklist (see
`followup-google-oauth-verification`).

## Mobile
Drive is API-driven/server-side — mobile inherits the callables. Native later uses the OS
share sheet / a native picker; web uses the Google Picker (ROADMAP §12 mobile note).

## Testing
- **Rules tests:** members can **read** `driveFiles`; **client writes to it are rejected**
  (only the callables, via Admin SDK, mutate it) — extend the advance rules tests.
- **Unit:** `drive-service` wrappers, `DriveFileRef` Zod parser, packet-folder logic
  (mock Drive API).
- **Manual:** connect Google → attach a Drive file → open link; generate packet → save to
  Drive → confirm in Drive.

## Out of scope (this phase)
- **Slack** — deferred; revisit model (notifications-bot vs per-user OAuth) after Drive.
- **13c** template-content-from-Drive — deferred.
- **Sheets/Docs** export or structured Docs import.
- Broad `drive` / `drive.readonly` scopes.
- Server-side cross-user auto-sharing of linked files (possible later add, not now).

## Resolved (2026-06-25)
All product/build questions are settled; the decisions above are final for this phase:
- Metadata via the **server-side `linkDriveFile`** callable (not client-written).
- `driveFiles` as an **array field** on the advance.
- Save-to-Drive as a **separate `savePacketToDrive` callable**.
- **13c deferred.**
- Cross-user access: **inline note + Shared-Drive guidance** first; auto-share later.

Build-time details (no product input needed): exact Picker loader wiring and the Drive app
folder layout.
