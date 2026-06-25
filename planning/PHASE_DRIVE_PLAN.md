# Phase 13 — Google Drive — plan

ROADMAP §12 (Integrations → Google Drive). Targets (decided): **attach/link Drive
files to advances**, **store generated packets in Drive**, **source template content
from Drive**. (Sheets/Docs export explicitly out.) Builds directly on Phase 11b's
per-user Google OAuth.

> **Status: PROPOSED — plan only.** Decisions locked 2026-06-25; awaiting approval
> before any implementation. No code yet.

## Decisions (locked 2026-06-25)
- **Auth:** reuse 11b per-user OAuth — no new OAuth flow, token store, or refresh logic.
- **Scope:** Google **`drive.file`** + the **Google Picker** (least privilege: the app
  only sees files it creates or the user explicitly picks). **Not** broad `drive` /
  `drive.readonly` (those are *restricted* scopes that trigger a heavy Google security
  assessment; `drive.file` does not).
- **Slice order:** **13a** attach/link files → **13b** save packet to Drive → **13c**
  source template content (deferrable).
- **Slack: deferred** — revisit after Drive ships (see _Out of scope_).

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
  grants the app per-file access. Returns `fileId` + metadata.
- **Model:** lightweight metadata on the advance —
  `driveFiles: DriveFileRef[]` on `events/{eventId}/stages/{stageId}/advances/{advanceId}`
  (array field, mirroring `links`/`contacts` on production records):
  ```ts
  interface DriveFileRef {
    fileId: string;
    name: string;
    mimeType: string;
    iconLink: string | null;
    webViewLink: string;          // always rendered; opening depends on viewer's access
    linkedByUid: string;
    linkedByEmail: string | null;
    linkedAt: Timestamp;
  }
  ```
  Canonical type in `src/lib/google/` (Zod parser); writes ride the existing advance
  write gate.
- **UI:** `DriveFilesEditor` on the advance screen, mirroring `AttachmentsEditor`
  (`src/features/events/AttachmentsEditor.tsx`) — list with name + open-in-Drive + remove;
  an "Attach from Drive" button gated on the Drive scope (else a connect prompt).
- **Per-user access caveat (ROADMAP §15):** a file linked by user A may be inaccessible
  to user B. We persist `webViewLink` so the link always shows; opening depends on the
  viewer's own Drive access/sharing. Surface this in the UI ("opens in the linker's
  Drive — ask them to share if needed"). **No server-side cross-user re-sharing** (would
  need a broader scope — out of scope).

## 13b — Save generated packet to Drive
- After `generatePacket` renders the buffer (`functions/src/index.ts:334`) and saves the
  Storage copy (unchanged), **additionally** upload to the caller's Drive via
  `drive.files.create` (media upload) into an app folder (`46 Advance / {event name}`),
  using `authedClientForUser`. Return the `webViewLink`.
- **Graceful no-op** when the caller hasn't connected Google / granted Drive (mirrors the
  schedule-push pattern) — the Storage packet + signed link still work.
- Likely a **separate `savePacketToDrive` callable** (push an already-generated packet)
  rather than a `toDrive` flag on `generatePacket` — keeps `generatePacket` lean and lets
  users opt in after generating. Confirm in build.

## 13c — Source template content from Drive (deferrable)
Most complex; touches templates (`src/lib/templates/`, `templates-service.ts`). Without
Docs/Sheets parsing (out of scope), this reduces to **"link reference files on a
template"** that carry over on create-from-template — not structured content import.
**Recommend deferring** or shipping only the reference-link form. Flag as open.

## Backend
- New `functions/src/googleDrive.ts` (mirrors `googleSchedule.ts` / `googleBookings.ts`):
  all functions reuse `authedClientForUser`, `assertCanEditEvent`, `OAUTH_SECRETS`.
- Wire exports alongside the existing google functions.
- **Rate-limit** Drive calls with `checkFirestoreRateLimit()` (security rule).

## Client
- `src/lib/google/drive-service.ts` (callable wrappers + Picker helper) + a `useDriveFiles`
  React Query hook.
- **Picker loader** needs a Google Cloud **API key / app id** (separate from the OAuth
  client; non-secret, HTTP-referrer-restricted) + the user's OAuth access token. Put the
  key in `src/config/integrations.ts` (create on first use — canonical table) alongside
  the project number.
- UI: `DriveFilesEditor` (advance) + a "Save to Drive" action on the packet UI.

## Security / rules
- `driveFiles` writes ride the existing advance write gate (PM/admin/dept-lead per
  `firestore.rules`); extend advance shape validation if rules validate fields.
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
- **Rules tests:** advance `driveFiles` write authz (member read, PM/admin write) — extend
  existing advance rules tests.
- **Unit:** `drive-service` wrappers, `DriveFileRef` Zod parser, packet-folder logic
  (mock Drive API).
- **Manual:** connect Google → attach a Drive file → open link; generate packet → save to
  Drive → confirm in Drive.

## Out of scope (this phase)
- **Slack** — deferred; revisit model (notifications-bot vs per-user OAuth) after Drive.
- **Sheets/Docs** export or structured Docs import.
- Broad `drive` / `drive.readonly` scopes.
- Server-side cross-user re-sharing of linked files.

## Open questions to confirm before build
- 13a: capture file metadata client-side (from the Picker result) vs server-side
  (`drive.files.get`)? _Lean: client-side + persist via the advance write gate._
- 13b: separate `savePacketToDrive` callable vs a `toDrive` flag on `generatePacket`?
  _Lean: separate callable._
- 13c: ship "link reference files on a template" or defer entirely? _Lean: defer._
- `driveFiles` as an advance field vs a subcollection? _Lean: field (mirrors
  links/contacts)._
- How much to surface the per-user "linker-only access" caveat in the UI.
