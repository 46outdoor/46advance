/**
 * External integration config (non-secret, public client values). Canonical source for
 * third-party client IDs/keys — never hardcode these in components.
 *
 * Google Picker (Phase 13) needs a Google Cloud **API key** (referrer-restricted; create
 * one in the `advancethat` project and set `VITE_GOOGLE_PICKER_API_KEY`) plus the **app id**
 * (the Google Cloud project number — same value as the Firebase messaging sender id). When
 * the API key is absent the Drive Picker UI disables itself gracefully.
 */
export const GOOGLE_PICKER_API_KEY = (import.meta.env.VITE_GOOGLE_PICKER_API_KEY as string | undefined) ?? '';

/** Google Cloud project number, used as the Picker `appId`. Reuses the Firebase sender id. */
export const GOOGLE_APP_ID = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ?? '';

/** Whether the Drive Picker has the config it needs to run. */
export function isPickerConfigured(): boolean {
  return GOOGLE_PICKER_API_KEY.length > 0;
}

/**
 * postMessage payload the OAuth callback popup sends its opener once Google is connected; the
 * app listens for it to refresh connection state. MUST match the literal posted by the server
 * in `functions/src/google.ts` (separate toolchain — kept in sync by this shared name here).
 */
export const GOOGLE_CONNECTED_MESSAGE = '46advance:google-connected';
