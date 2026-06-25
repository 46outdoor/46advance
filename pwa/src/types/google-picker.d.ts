/**
 * Minimal ambient types for the Google Picker API + gapi loader (injected at runtime via
 * https://apis.google.com/js/api.js). Declares only the surface `drive-service.ts` uses —
 * not the full SDK.
 */
interface GapiClient {
  load(library: 'picker', config: { callback: () => void; onerror?: () => void }): void;
}

interface PickerDocsView {
  setIncludeFolders(include: boolean): PickerDocsView;
  setSelectFolderEnabled(enabled: boolean): PickerDocsView;
  setMimeTypes(mimeTypes: string): PickerDocsView;
  setOwnedByMe(ownedByMe: boolean): PickerDocsView;
  setStarred(starred: boolean): PickerDocsView;
  setEnableDrives(enable: boolean): PickerDocsView;
}

interface PickerResponseDoc {
  id: string;
  name?: string;
  mimeType?: string;
}

interface PickerResponse {
  action: string;
  docs?: PickerResponseDoc[];
}

interface PickerInstance {
  setVisible(visible: boolean): void;
}

interface PickerBuilder {
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  addView(view: PickerDocsView): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setCallback(callback: (data: PickerResponse) => void): PickerBuilder;
  build(): PickerInstance;
}

interface GooglePickerNamespace {
  DocsView: new (viewId?: string) => PickerDocsView;
  PickerBuilder: new () => PickerBuilder;
  ViewId: { DOCS: string };
  Feature: { MULTISELECT_ENABLED: string; SUPPORT_DRIVES: string };
  Action: { PICKED: string; CANCEL: string };
}

interface Window {
  gapi?: GapiClient;
  google?: { picker: GooglePickerNamespace };
}
