/**
 * React Query hook for the caller's Google connection status (Phase 11b). Refetches on
 * window focus, so closing the OAuth popup and returning to the app reflects the new
 * state. The OAuth callback also posts `46advance:google-connected`; GoogleConnectCard
 * invalidates this query on that message.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { getGoogleConnection, type GoogleConnection } from './google-service';

export const googleConnectionKey = (uid: string | undefined) => ['google', 'connection', uid] as const;

export function useGoogleConnection() {
  const { user } = useAuth();
  return useQuery<GoogleConnection | null>({
    queryKey: googleConnectionKey(user?.uid),
    queryFn: () => getGoogleConnection(user!.uid),
    enabled: !!user,
  });
}
