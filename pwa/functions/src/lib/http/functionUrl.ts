/**
 * Public URL of one of this project's HTTPS functions — the stable 2nd-gen
 * cloudfunctions.net alias in prod, the local emulator URL when running there.
 * Single source for externally visible function URLs (the OAuth redirect URI in
 * google.ts is registered verbatim on the Google OAuth client; the calendar feed
 * URL lands in subscribers' calendar apps) so the form can't drift per caller.
 */
const PROJECT_ID = 'advancethat';
const REGION = 'us-central1';

export function httpsFunctionUrl(name: string): string {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}/${name}`;
  }
  return `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
}
