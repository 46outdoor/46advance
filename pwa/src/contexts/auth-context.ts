import { createContext, useContext } from 'react';
import type { User } from '@/features/auth/auth-service';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Global admin (Firebase custom claim `admin`), seeded from the config allowlist. */
  isAdmin: boolean;
  /** Global organizer (custom claim `organizer`): may create events. Admin-grantable. */
  isOrganizer: boolean;
  /**
   * Global production director (custom claim `productionDirector`): read-only oversight of
   * EVERY event, whether or not the user is a member. Grants no writes and no admin functions —
   * a director who must edit a show is assigned that event's production-manager role.
   * Always a boolean: AuthProvider normalizes the callable response (see `applyClaims`).
   */
  isProductionDirector: boolean;
  /** App access (custom claim `approved`). New accounts start pending until an admin approves. */
  approved: boolean;
  /** Whether the user's email is verified. No `admin`/`approved` claim is granted until it is. */
  emailVerified: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Re-send the verification email to the current (unverified) user. */
  resendVerification: () => Promise<void>;
  /** Reload the user from the server (picks up a freshly-verified email) and re-sync claims. */
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
