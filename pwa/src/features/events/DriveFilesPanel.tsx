/**
 * Drive files linked to an advance (Phase 13). Members see the list; PMs/admins attach via
 * the Google Picker (requires a connected Google account with Drive access) and remove links.
 * Linked files live in the linker's Drive — others can open them only if shared — so we say
 * so and nudge toward shared drives.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { formatDate } from '@/lib/dates/formatting';
import { isPickerConfigured } from '@/config/integrations';
import {
  getGoogleAuthUrl,
  googleConnectionKey,
  linkDriveFile,
  pickDriveFiles,
  removeDriveFile,
  useGoogleConnection,
  type AdvanceRef,
  type DriveFileRef,
} from '@/lib/google';

const logger = createLogger('DriveFiles');

interface Props {
  eventId: string;
  stageId: string;
  advanceId: string;
  files: DriveFileRef[];
  canEdit: boolean;
  onChanged: () => void;
}

export function DriveFilesPanel({ eventId, stageId, advanceId, files, canEdit, onChanged }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const connectionQuery = useGoogleConnection();
  const [error, setError] = useState<string | null>(null);

  const ref: AdvanceRef = { eventId, stageId, advanceId };
  const connection = connectionQuery.data;
  const hasDrive = connection?.hasDrive === true;

  // The OAuth callback popup posts this once tokens are stored; refresh the connection.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data === '46advance:google-connected') {
        void queryClient.invalidateQueries({ queryKey: googleConnectionKey(user?.uid) });
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [queryClient, user?.uid]);

  const attach = useMutation({
    mutationFn: async () => {
      const ids = await pickDriveFiles();
      for (const id of ids) await linkDriveFile(ref, id);
      return ids.length;
    },
    onSuccess: (count) => {
      setError(null);
      if (count > 0) onChanged();
    },
    onError: (e) => {
      logger.error('Failed to attach Drive file', e);
      setError('Could not attach the file. Make sure your Google account has Drive access.');
    },
  });

  const remove = useMutation({
    mutationFn: (fileId: string) => removeDriveFile(ref, fileId),
    onSuccess: () => onChanged(),
    onError: (e) => logger.error('Failed to remove Drive file', e),
  });

  const connect = useMutation({
    // Open the popup inside the click gesture so blockers don't kill it; fall back to redirect.
    mutationFn: async () => {
      const popup = window.open('about:blank', 'google-oauth', 'width=480,height=720');
      try {
        const url = await getGoogleAuthUrl();
        if (popup && !popup.closed) popup.location.href = url;
        else window.location.assign(url);
      } catch (e) {
        popup?.close();
        throw e;
      }
    },
    onError: (e) => logger.error('Failed to start Google connect', e),
  });

  return (
    <div className="space-y-3 border-t border-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-brand">Drive files</h2>
        {canEdit && hasDrive && isPickerConfigured() && (
          <button
            type="button"
            onClick={() => attach.mutate()}
            disabled={attach.isPending}
            className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {attach.isPending ? 'Opening…' : 'Attach from Drive'}
          </button>
        )}
      </div>

      {files.length === 0 && <p className="text-sm text-ink-muted">No Drive files linked.</p>}
      {files.length > 0 && (
        <ul className="divide-y divide-line/60 text-sm">
          {files.map((file) => (
            <li key={file.fileId} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <a className="text-accent underline" href={file.webViewLink} target="_blank" rel="noreferrer">
                  {file.name}
                </a>
                <span className="block text-xs text-ink-muted">
                  {file.linkedByEmail ? `Linked by ${file.linkedByEmail}` : 'Linked'}
                  {file.linkedAt ? ` · ${formatDate(file.linkedAt)}` : ''} · opens in the linker’s Drive
                </span>
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove.mutate(file.fileId)}
                  disabled={remove.isPending}
                  className="shrink-0 rounded border border-line px-2 py-0.5 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !hasDrive && !connectionQuery.isLoading && (
        <p className="text-sm text-ink-muted">
          {connection?.connected
            ? 'Reconnect your Google account to grant Drive access, then attach files. '
            : 'Connect your Google account (with Drive) to attach files. '}
          <button
            type="button"
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="text-accent underline disabled:opacity-50"
          >
            {connection?.connected ? 'Reconnect Google' : 'Connect Google'}
          </button>
        </p>
      )}

      {canEdit && hasDrive && !isPickerConfigured() && (
        <p className="text-xs text-ink-muted">Drive Picker isn’t configured yet (missing API key).</p>
      )}

      <p className="max-w-prose text-xs text-ink-muted">
        Linked files live in the linker’s Drive — teammates can open them only if they’re shared. Tip:
        link from a shared drive so everyone on the event has access.
      </p>

      {error && <p className="text-sm text-accent">{error}</p>}
    </div>
  );
}
