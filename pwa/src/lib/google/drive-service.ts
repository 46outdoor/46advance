/**
 * Google Drive client access (Phase 13). Per-user OAuth (reuses 11b): linking, unlinking,
 * and packet-save run server-side (functions/src/googleDrive.ts); this module wraps those
 * callables and drives the browser Google Picker. The Picker needs a short-lived access
 * token (minted by `getDriveAccessToken`) + a referrer-restricted API key — refresh tokens
 * never reach the client.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { GOOGLE_APP_ID, GOOGLE_PICKER_API_KEY, isPickerConfigured } from '@/config/integrations';
import type {
  GetArtistDocumentContentInput,
  GetArtistDocumentContentOutput,
  GetDriveAccessTokenOutput,
  ImportDriveFolderInput,
  ImportDriveFolderOutput,
  LinkDriveFileInput,
  RemoveDriveFileInput,
  DriveOkOutput,
  SavePacketToDriveInput,
  SavePacketToDriveOutput,
} from '@contracts/callables/googleDrive';

export interface AdvanceRef {
  eventId: string;
  stageId: string;
  advanceId: string;
}

/** Link a Picker-selected Drive file to an advance (server validates access + metadata). */
export async function linkDriveFile(ref: AdvanceRef, fileId: string): Promise<void> {
  const callable = httpsCallable<LinkDriveFileInput, DriveOkOutput>(functions, 'linkDriveFile');
  await callable({ ...ref, fileId });
}

/** Unlink a Drive file from an advance (does not delete it from Drive). */
export async function removeDriveFile(ref: AdvanceRef, fileId: string): Promise<void> {
  const callable = httpsCallable<RemoveDriveFileInput, DriveOkOutput>(functions, 'removeDriveFile');
  await callable({ ...ref, fileId });
}

export interface SavePacketResult {
  saved: boolean;
  reason?: string | null;
  webViewLink?: string | null;
}

/** Copy an already-generated packet (Storage `path`) into the caller's Drive. */
export async function savePacketToDrive(eventId: string, path: string): Promise<SavePacketResult> {
  const callable = httpsCallable<SavePacketToDriveInput, SavePacketToDriveOutput>(functions, 'savePacketToDrive');
  return (await callable({ eventId, path })).data;
}

/** Import an artist-docs Drive folder (per-artist subfolders) into the library. Server enumerates. */
export async function importDriveFolder(folderId: string): Promise<ImportDriveFolderOutput> {
  const callable = httpsCallable<ImportDriveFolderInput, ImportDriveFolderOutput>(functions, 'importDriveFolder');
  return (await callable({ folderId })).data;
}

/**
 * Fetch a document's bytes via the service-account broker — for approved techs who can't
 * open the file in Drive directly. The fileId must be a known artist document, or (with
 * `eventId`) an event document the caller's membership covers. Returns base64 + mime +
 * name. See openArtistDocument() for the view/download flow.
 */
export async function getArtistDocumentContent(
  fileId: string,
  eventId?: string,
): Promise<GetArtistDocumentContentOutput> {
  const callable = httpsCallable<GetArtistDocumentContentInput, GetArtistDocumentContentOutput>(
    functions,
    'getArtistDocumentContent',
  );
  return (await callable(eventId ? { fileId, eventId } : { fileId })).data;
}

export interface DriveUploadResult {
  fileId: string;
  name: string;
  mimeType: string;
  iconLink: string | null;
  webViewLink: string;
}

/**
 * Upload a file into a Drive folder via the caller's short-lived `drive.file` token
 * (multipart create with `parents: [folderId]`). Returns the created file's refs. The
 * uploader needs Drive edit access on the folder; for other members to open the file
 * in-app, the folder must be shared with the docs-broker service account.
 */
export async function uploadFileToDrive(file: File, folderId: string): Promise<DriveUploadResult> {
  const token = await getDriveAccessToken();
  const metadata = { name: file.name, parents: [folderId] };
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  body.append('file', file);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,iconLink,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body },
  );
  if (!res.ok) throw new Error(`Drive upload failed (${res.status}).`);
  const data = (await res.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
    iconLink?: string;
    webViewLink?: string;
  };
  if (!data.id || !data.webViewLink) throw new Error('Drive upload returned no file reference.');
  return {
    fileId: data.id,
    name: data.name ?? file.name,
    mimeType: data.mimeType ?? file.type ?? 'application/octet-stream',
    iconLink: data.iconLink ?? null,
    webViewLink: data.webViewLink,
  };
}

/** Create a Drive folder under `parentId` (e.g. a new artist's subfolder in the
 * library root) via the caller's `drive.file` token; returns the new folder's id. */
export async function createDriveFolder(name: string, parentId: string): Promise<string> {
  const token = await getDriveAccessToken();
  const res = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  if (!res.ok) throw new Error(`Drive folder creation failed (${res.status}).`);
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('Drive folder creation returned no id.');
  return data.id;
}

/** Best-effort delete of an app-created Drive file (compensating cleanup when the
 * app-side record write fails after an upload). `drive.file` covers files we created. */
export async function deleteDriveUpload(fileId: string): Promise<void> {
  const token = await getDriveAccessToken();
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * View an artist document in-app via the broker: opens a blank tab synchronously (in the click
 * gesture, to dodge popup blockers), fetches the bytes, then points the tab at a blob URL —
 * falling back to a download if the tab was blocked.
 */
const DOC_LOADING_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Loading…</title><style>
html,body{margin:0;height:100%}
body{display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#fff;font-family:system-ui,-apple-system,sans-serif}
.s{width:34px;height:34px;border:3px solid #2a2a2a;border-top-color:#f04040;border-radius:50%;animation:sp .8s linear infinite;margin:0 auto}
@keyframes sp{to{transform:rotate(360deg)}}
p{margin-top:18px;color:#8a8a8a;font-size:14px;letter-spacing:.02em}
</style></head><body><div style="text-align:center"><div class="s"></div><p>Loading document…</p></div></body></html>`;

export async function openArtistDocument(fileId: string, eventId?: string): Promise<void> {
  const tab = window.open('', '_blank');
  if (tab) tab.document.write(DOC_LOADING_HTML); // show a spinner while the broker fetches the bytes
  try {
    const { base64, mimeType, name } = await getArtistDocumentContent(fileId, eventId);
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    if (tab) {
      tab.location.href = url;
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

async function getDriveAccessToken(): Promise<string> {
  const callable = httpsCallable<Record<string, never>, GetDriveAccessTokenOutput>(functions, 'getDriveAccessToken');
  return (await callable({})).data.accessToken;
}

let pickerLoad: Promise<void> | null = null;

/** Lazily load the Google API script + the `picker` library (once). */
function loadPicker(): Promise<void> {
  if (pickerLoad) return pickerLoad;
  pickerLoad = new Promise<void>((resolve, reject) => {
    const finish = () => {
      const gapi = window.gapi;
      if (!gapi) {
        reject(new Error('Google API failed to load.'));
        return;
      }
      gapi.load('picker', {
        callback: () => resolve(),
        onerror: () => reject(new Error('Drive Picker failed to load.')),
      });
    };
    if (window.gapi) {
      finish();
      return;
    }
    const existing = document.getElementById('google-api-js') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-api-js';
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = finish;
    script.onerror = () => reject(new Error('Could not load the Google API.'));
    document.head.appendChild(script);
  });
  return pickerLoad;
}

/**
 * Open the Google Picker and resolve the selected file ids (`[]` if the user cancels).
 * Selecting a file grants our OAuth client per-file access under `drive.file`, which the
 * server `linkDriveFile` callable then reads. Throws if the Picker isn't configured.
 */
export async function pickDriveFiles(): Promise<string[]> {
  if (!isPickerConfigured()) throw new Error('Drive Picker is not configured.');
  const token = await getDriveAccessToken();
  await loadPicker();
  const picker = window.google?.picker;
  if (!picker) throw new Error('Drive Picker is unavailable.');

  return new Promise<string[]>((resolve) => {
    // Browsable file views (folders shown, but only files are selectable). Company files are
    // usually shared into the user's account or in a shared drive, so expose those tabs too.
    const browsable = (view: PickerDocsView) => view.setIncludeFolders(true).setSelectFolderEnabled(false);
    const myDrive = browsable(new picker.DocsView(picker.ViewId.DOCS));
    const sharedWithMe = browsable(new picker.DocsView(picker.ViewId.DOCS).setOwnedByMe(false));
    const sharedDrives = browsable(new picker.DocsView(picker.ViewId.DOCS).setEnableDrives(true));
    const starred = new picker.DocsView(picker.ViewId.DOCS).setStarred(true);

    const builder = new picker.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_PICKER_API_KEY)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .addView(myDrive)
      .addView(sharedWithMe)
      .addView(sharedDrives)
      .addView(starred)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve((data.docs ?? []).map((doc) => doc.id));
        else if (data.action === picker.Action.CANCEL) resolve([]);
      });
    if (GOOGLE_APP_ID) builder.setAppId(GOOGLE_APP_ID);
    builder.build().setVisible(true);
  });
}

export interface DriveFolderRef {
  id: string;
  name: string;
}

/**
 * Open the Google Picker to select a single Drive FOLDER; resolves its id + name (or null
 * on cancel). Selecting the folder grants our OAuth client `drive.file` access to it + its
 * contents (enumerated server-side for imports; upload target for event documents).
 */
export async function pickDriveFolder(): Promise<DriveFolderRef | null> {
  if (!isPickerConfigured()) throw new Error('Drive Picker is not configured.');
  const token = await getDriveAccessToken();
  await loadPicker();
  const picker = window.google?.picker;
  if (!picker) throw new Error('Drive Picker is unavailable.');

  return new Promise<DriveFolderRef | null>((resolve) => {
    const folderView = (view: PickerDocsView) => view.setIncludeFolders(true).setSelectFolderEnabled(true);
    const myDrive = folderView(new picker.DocsView(picker.ViewId.DOCS));
    const sharedWithMe = folderView(new picker.DocsView(picker.ViewId.DOCS).setOwnedByMe(false));
    const sharedDrives = folderView(new picker.DocsView(picker.ViewId.DOCS).setEnableDrives(true));

    const builder = new picker.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_PICKER_API_KEY)
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .addView(myDrive)
      .addView(sharedWithMe)
      .addView(sharedDrives)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) {
          const picked = data.docs?.[0];
          resolve(picked?.id ? { id: picked.id, name: picked.name ?? 'Drive folder' } : null);
        } else if (data.action === picker.Action.CANCEL) resolve(null);
      });
    if (GOOGLE_APP_ID) builder.setAppId(GOOGLE_APP_ID);
    builder.build().setVisible(true);
  });
}
