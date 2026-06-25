/**
 * Google Calendar + Meet client access (Phase 11b). Per-user OAuth: the connect/
 * disconnect dance and calendar/Meet creation run server-side (functions/src/google.ts);
 * this module wraps the callables and reads the non-secret connection status from
 * `googleConnections/{uid}` (owner/admin read per firestore.rules). Tokens never reach
 * the client.
 */
import { doc, getDoc } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/services/firebase';

/** The least-privilege Drive scope (Phase 13) — must match functions/src/google.ts. */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface GoogleConnection {
  connected: boolean;
  email: string | null;
  /** Scopes granted on the last connect (from googleConnections/{uid}). */
  scopes: string[];
  /** Whether the granted scopes include Drive file access. */
  hasDrive: boolean;
}

/** Read the caller's connection status. Returns null when never connected. */
export async function getGoogleConnection(uid: string): Promise<GoogleConnection | null> {
  const snap = await getDoc(doc(db, 'googleConnections', uid));
  if (!snap.exists()) return null;
  const data: DocumentData = snap.data();
  const scopes = Array.isArray(data.scopes) ? data.scopes.filter((s): s is string => typeof s === 'string') : [];
  return {
    connected: data.connected === true,
    email: typeof data.email === 'string' ? data.email : null,
    scopes,
    hasDrive: scopes.includes(DRIVE_FILE_SCOPE),
  };
}

/** Build the OAuth consent URL (server creates a single-use state). */
export async function getGoogleAuthUrl(): Promise<string> {
  const callable = httpsCallable<Record<string, never>, { url: string }>(functions, 'googleAuthUrl');
  const res = await callable({});
  return res.data.url;
}

/** Revoke + clear the caller's Google connection. */
export async function disconnectGoogle(): Promise<void> {
  const callable = httpsCallable<Record<string, never>, { ok: boolean }>(functions, 'googleDisconnect');
  await callable({});
}

export interface AdvanceCallResult {
  link: string | null;
  calendarId: string;
  calendarEventId: string | null;
}

/**
 * Create a Google Calendar event with a Meet link for an advance call (auto-creates the
 * event's calendar if needed) and write the link + time back to the advance. Returns the
 * Meet link.
 */
export async function createAdvanceCall(input: {
  eventId: string;
  stageId: string;
  advanceId: string;
  startMillis: number;
  durationMinutes?: number;
}): Promise<AdvanceCallResult> {
  const callable = httpsCallable<typeof input, AdvanceCallResult>(functions, 'createAdvanceCall');
  const res = await callable(input);
  return res.data;
}
