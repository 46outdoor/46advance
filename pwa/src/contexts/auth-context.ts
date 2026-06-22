import { createContext, useContext } from 'react';
import type { User } from '@/features/auth/auth-service';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Global admin (Firebase custom claim `admin`), seeded from the config allowlist. */
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
