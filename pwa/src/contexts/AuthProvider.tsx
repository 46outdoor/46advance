import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from '@/contexts/auth-context';
import type { AuthContextValue } from '@/contexts/auth-context';
import {
  observeAuthState,
  sendPasswordReset,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
  syncUserClaims,
} from '@/features/auth/auth-service';
import type { User } from '@/features/auth/auth-service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Auth');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [loading, setLoading] = useState(true);
  const syncedUid = useRef<string | null>(null);

  useEffect(() => {
    return observeAuthState((nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        syncedUid.current = null;
        setIsAdmin(false);
        setIsOrganizer(false);
        setLoading(false);
        return;
      }
      // Sync once per sign-in (token refreshes re-fire this with the same uid).
      if (syncedUid.current === nextUser.uid) return;
      syncedUid.current = nextUser.uid;
      void (async () => {
        try {
          const { isAdmin: admin, isOrganizer: organizer } = await syncUserClaims();
          await nextUser.getIdToken(true); // refresh so the token carries the new claim
          setIsAdmin(admin);
          setIsOrganizer(organizer);
        } catch (err) {
          logger.error('Failed to sync user claims; falling back to cached claims', err);
          try {
            const token = await nextUser.getIdTokenResult();
            setIsAdmin(token.claims.admin === true);
            setIsOrganizer(token.claims.organizer === true);
          } catch {
            setIsAdmin(false);
            setIsOrganizer(false);
          }
        } finally {
          setLoading(false);
        }
      })();
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAdmin,
      isOrganizer,
      signIn: async (email, password) => {
        await signInWithEmail(email, password);
      },
      signUp: async (email, password) => {
        await signUpWithEmail(email, password);
      },
      signOut: () => signOutUser(),
      resetPassword: (email) => sendPasswordReset(email),
    }),
    [user, loading, isAdmin, isOrganizer],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
