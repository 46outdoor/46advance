import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from '@/contexts/auth-context';
import type { AuthContextValue } from '@/contexts/auth-context';
import {
  observeAuthState,
  sendPasswordReset,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
} from '@/features/auth/auth-service';
import type { User } from '@/features/auth/auth-service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Auth');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return observeAuthState((nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      nextUser
        .getIdTokenResult()
        .then((token) => setIsAdmin(token.claims.admin === true))
        .catch((err) => {
          logger.error('Failed to read admin claim', err);
          setIsAdmin(false);
        })
        .finally(() => setLoading(false));
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAdmin,
      signIn: async (email, password) => {
        await signInWithEmail(email, password);
      },
      signUp: async (email, password) => {
        await signUpWithEmail(email, password);
      },
      signOut: () => signOutUser(),
      resetPassword: (email) => sendPasswordReset(email),
    }),
    [user, loading, isAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
