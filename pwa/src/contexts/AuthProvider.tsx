import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from '@/contexts/auth-context';
import type { AuthContextValue } from '@/contexts/auth-context';
import {
  observeAuthState,
  reloadCurrentUser,
  resendVerificationEmail,
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
  const [approved, setApproved] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const syncedUid = useRef<string | null>(null);

  // Resolve global claims for a signed-in user (server grants none until email is verified),
  // then refresh the token so it carries them. Falls back to cached claims on failure.
  const applyClaims = useCallback(async (nextUser: User) => {
    try {
      const { isAdmin: admin, isOrganizer: organizer, approved: ok } = await syncUserClaims();
      await nextUser.getIdToken(true); // refresh so the token carries the new claim
      setIsAdmin(admin);
      setIsOrganizer(organizer);
      setApproved(ok);
    } catch (err) {
      logger.error('Failed to sync user claims; falling back to cached claims', err);
      try {
        const token = await nextUser.getIdTokenResult();
        setIsAdmin(token.claims.admin === true);
        setIsOrganizer(token.claims.organizer === true);
        setApproved(token.claims.approved === true);
      } catch {
        setIsAdmin(false);
        setIsOrganizer(false);
        setApproved(false);
      }
    }
  }, []);

  useEffect(() => {
    return observeAuthState((nextUser) => {
      setUser(nextUser);
      setEmailVerified(nextUser?.emailVerified ?? false);
      if (!nextUser) {
        syncedUid.current = null;
        setIsAdmin(false);
        setIsOrganizer(false);
        setApproved(false);
        setLoading(false);
        return;
      }
      // Sync once per sign-in (token refreshes re-fire this with the same uid).
      if (syncedUid.current === nextUser.uid) return;
      syncedUid.current = nextUser.uid;
      void (async () => {
        await applyClaims(nextUser);
        setLoading(false);
      })();
    });
  }, [applyClaims]);

  // Reload the user from the server (after they click the verification link) and, once
  // verified, re-sync claims so admin/approved take effect without a full re-sign-in.
  const refreshUser = useCallback(async () => {
    const refreshed = await reloadCurrentUser();
    setUser(refreshed);
    setEmailVerified(refreshed?.emailVerified ?? false);
    if (refreshed?.emailVerified) await applyClaims(refreshed);
  }, [applyClaims]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAdmin,
      isOrganizer,
      approved,
      emailVerified,
      signIn: async (email, password) => {
        await signInWithEmail(email, password);
      },
      signUp: async (email, password) => {
        await signUpWithEmail(email, password);
      },
      signOut: () => signOutUser(),
      resetPassword: (email) => sendPasswordReset(email),
      resendVerification: () => resendVerificationEmail(),
      refreshUser,
    }),
    [user, loading, isAdmin, isOrganizer, approved, emailVerified, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
