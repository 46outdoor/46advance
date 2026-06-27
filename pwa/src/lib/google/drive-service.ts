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
  GetDriveAccessTokenOutput,
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
