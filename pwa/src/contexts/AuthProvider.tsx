import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { clearFirestoreCache } from '@/services/firebase';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Auth');

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [isProductionDirector, setIsProductionDirector] = useState(false);
  const [isProductionCoordinator, setIsProductionCoordinator] = useState(false);
  const [approved, setApproved] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const syncedUid = useRef<string | null>(null);

  // Resolve global claims for a signed-in user (server grants none until email is verified),
  // then refresh the token so it carries them. Falls back to cached claims on failure.
  const applyClaims = useCallback(async (nextUser: User) => {
    try {
      // ⚠ `isProductionDirector: director = false` is load-bearing — do NOT "simplify" it away.
      // `syncUserClaimsOutputSchema` declares `.default(false)`, but output schemas here are
      // COMPILE-TIME contracts only: `syncUserClaims()` passes the type as a generic to
      // `httpsCallable<…>` and returns `result.data` raw — nothing calls `.parse()` on the
      // client, so the schema default never runs in the browser. Against an older Functions
      // response (pre-rollout, or after a Functions rollback) the field arrives `undefined`,
      // which would put a non-boolean into boolean state and flow on into
      // `Viewer.isProductionDirector: boolean` as a type lie. Normalizing here matches the
      // `=== true` idiom the cached-token fallback below already uses.
      const {
        isAdmin: admin,
        isOrganizer: organizer,
        isProductionDirector: director = false,
        // Same legacy-response normalization as the director flag above.
        isProductionCoordinator: coordinator = false,
        approved: ok,
      } = await syncUserClaims();
      await nextUser.getIdToken(true); // refresh so the token carries the new claim
      setIsAdmin(admin);
      setIsOrganizer(organizer);
      setIsProductionDirector(director);
      setIsProductionCoordinator(coordinator);
      setApproved(ok);
    } catch (err) {
      logger.error('Failed to sync user claims; falling back to cached claims', err);
      try {
        const token = await nextUser.getIdTokenResult();
        setIsAdmin(token.claims.admin === true);
        setIsOrganizer(token.claims.organizer === true);
        setIsProductionDirector(token.claims.productionDirector === true);
        setIsProductionCoordinator(token.claims.productionCoordinator === true);
        setApproved(token.claims.approved === true);
      } catch {
        setIsAdmin(false);
        setIsOrganizer(false);
        setIsProductionDirector(false);
        setIsProductionCoordinator(false);
        setApproved(false);
      }
    }
  }, []);

  useEffect(() => {
    return observeAuthState((nextUser) => {
      // Cross-user cache isolation: on any identity transition away from a signed-in user
      // (sign-out OR an account switch on a shared browser), cancel in-flight requests and
      // drop the prior user's cached queries + optimistic mutations before the next user's
      // app renders. Explicit sign-out also clears the Firestore persistent cache (signOut).
      const prevUid = syncedUid.current;
      if (prevUid && prevUid !== (nextUser?.uid ?? null)) {
        void queryClient.cancelQueries();
        queryClient.clear();
      }
      setUser(nextUser);
      setEmailVerified(nextUser?.emailVerified ?? false);
      if (!nextUser) {
        syncedUid.current = null;
        setIsAdmin(false);
        setIsOrganizer(false);
        setIsProductionDirector(false);
        setIsProductionCoordinator(false);
        setApproved(false);
        setLoading(false);
        return;
      }
      // Sync once per sign-in (token refreshes re-fire this with the same uid).
      if (syncedUid.current === nextUser.uid) return;
      syncedUid.current = nextUser.uid;
      // Re-enter loading for the new identity. `loading` is false by now on a fresh sign-in (the
      // signed-out branch above set it), and `approved` still holds its false default — so without
      // this the gate renders "Account pending approval" for the length of the syncUserClaims round
      // trip before the real claim arrives. It also stops the previous account's claims leaking
      // into the next one on a direct account switch. Batched with setUser above, so the gate sees
      // user-present + loading in one render, never the gap between them.
      setLoading(true);
      void (async () => {
        await applyClaims(nextUser);
        setLoading(false);
      })();
    });
  }, [applyClaims, queryClient]);

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
      isProductionDirector,
      isProductionCoordinator,
      approved,
      emailVerified,
      signIn: async (email, password) => {
        await signInWithEmail(email, password);
      },
      signUp: async (email, password, name) => {
        await signUpWithEmail(email, password, name);
      },
      signOut: async () => {
        await signOutUser();
        // Drop in-memory query data, clear the Firestore persistent cache, and reload to a
        // clean app so no prior-user cached documents survive on a shared browser.
        queryClient.clear();
        try {
          await clearFirestoreCache();
        } catch (err) {
          logger.error('Failed to clear the Firestore cache on sign-out', err);
        }
        window.location.assign('/sign-in');
      },
      resetPassword: (email) => sendPasswordReset(email),
      resendVerification: () => resendVerificationEmail(),
      refreshUser,
    }),
    [
      user,
      loading,
      isAdmin,
      isOrganizer,
      isProductionDirector,
      isProductionCoordinator,
      approved,
      emailVerified,
      refreshUser,
      queryClient,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
