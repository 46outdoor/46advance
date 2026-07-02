/**
 * Connect / disconnect the caller's Google account (Phase 11b). Connecting opens the
 * OAuth consent in a popup; the callback page posts `46advance:google-connected`, which
 * (plus refetch-on-focus) refreshes the status. Once connected, advance calls can create
 * a Calendar event + Meet link (see the advance detail screen).
 */
import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { GOOGLE_CONNECTED_MESSAGE } from '@/config/integrations';
import {
  disconnectGoogle,
  getGoogleAuthUrl,
  googleConnectionKey,
  useGoogleConnection,
} from '@/lib/google';

const logger = createLogger('GoogleConnect');

export function GoogleConnectCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const connectionQuery = useGoogleConnection();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: googleConnectionKey(user?.uid) });

  // The OAuth callback popup posts this once tokens are stored.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data === GOOGLE_CONNECTED_MESSAGE) void invalidate();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const connect = useMutation({
    // Open the popup synchronously (inside the click gesture) so blockers don't kill it,
    // then point it at the consent URL once the callable returns. Fall back to a full
    // redirect if the popup was blocked.
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

  const disconnect = useMutation({
    mutationFn: disconnectGoogle,
    onSuccess: () => invalidate(),
    onError: (e) => logger.error('Failed to disconnect Google', e),
  });

  const connection = connectionQuery.data;
  const isConnected = connection?.connected === true;

  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-display text-lg font-bold text-brand">Google Calendar</h3>
          <p className="max-w-prose text-sm text-ink-muted">
            Connect your Google account to create an advance call with a Google Meet link, on a
            calendar created for the event. Your Google access stays private to you; only the Meet
            link is shared on the advance.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            isConnected ? 'bg-status-complete/15 text-status-complete' : 'bg-surface-muted text-ink-muted'
          }`}
        >
          {isConnected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {connectionQuery.isLoading ? (
          <span className="text-ink-muted">Checking…</span>
        ) : isConnected ? (
          <>
            {connection?.email && (
              <span className="text-ink-muted">
                Connected as <span className="font-medium text-ink">{connection.email}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="rounded border border-line px-3 py-1.5 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="rounded bg-accent px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {connect.isPending ? 'Opening…' : 'Connect Google'}
          </button>
        )}
      </div>

      {(connect.isError || disconnect.isError) && (
        <p className="mt-2 text-sm text-accent">Something went wrong. Please try again.</p>
      )}
    </div>
  );
}
