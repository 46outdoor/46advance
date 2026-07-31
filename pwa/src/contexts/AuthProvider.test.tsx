import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import { AuthGate } from '@/features/auth/AuthGate';
import type { User } from '@/features/auth/auth-service';

// Drive onAuthStateChanged by hand so the sign-out → sign-in transition can be stepped through.
let emitAuthState: (user: User | null) => void = () => {};
const syncUserClaims = vi.fn();

vi.mock('@/features/auth/auth-service', () => ({
  observeAuthState: (cb: (user: User | null) => void) => {
    emitAuthState = cb;
    return () => {};
  },
  syncUserClaims: () => syncUserClaims(),
  reloadCurrentUser: vi.fn(),
  resendVerificationEmail: vi.fn(),
  sendPasswordReset: vi.fn(),
  signInWithEmail: vi.fn(),
  signOutUser: vi.fn(),
  signUpWithEmail: vi.fn(),
}));

vi.mock('@/services/firebase', () => ({ clearFirestoreCache: vi.fn() }));

/** Minimal User: the fields AuthProvider and AuthGate actually read. */
const testUser = (uid: string) =>
  ({
    uid,
    email: `${uid}@example.com`,
    emailVerified: true,
    getIdToken: vi.fn().mockResolvedValue('token'),
    getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }),
  }) as unknown as User;

function renderGate() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AuthProvider>
          <AuthGate>
            <p>Signed in content</p>
          </AuthGate>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthProvider — approval gate during claim resolution', () => {
  /**
   * Regression: signing in flashed "Account pending approval" for the length of the
   * syncUserClaims round trip. The signed-out branch had already set loading=false, and
   * `approved` still held its false default, so the gate rendered the pending screen in the
   * gap. An approved user must never be told their account is pending.
   */
  it('shows loading — not "pending approval" — while claims resolve after sign-in', async () => {
    let resolveClaims: (v: {
      isAdmin: boolean;
      isOrganizer: boolean;
      approved: boolean;
    }) => void = () => {};
    syncUserClaims.mockReturnValue(
      new Promise((resolve) => {
        resolveClaims = resolve;
      }),
    );

    renderGate();

    // Signed out first — this is what sets loading=false and arms the bug. The gate redirects
    // to /sign-in here, so nothing of the app renders.
    await act(async () => emitAuthState(null));
    expect(screen.queryByText('Signed in content')).not.toBeInTheDocument();

    // Now sign in. Claims are still in flight at this point.
    await act(async () => emitAuthState(testUser('user-1')));

    expect(screen.queryByText(/pending approval/i)).not.toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await act(async () => {
      resolveClaims({ isAdmin: false, isOrganizer: false, approved: true });
    });

    expect(screen.getByText('Signed in content')).toBeInTheDocument();
  });

  it('still shows "pending approval" once claims confirm the account is not approved', async () => {
    syncUserClaims.mockResolvedValue({ isAdmin: false, isOrganizer: false, approved: false });

    renderGate();
    await act(async () => emitAuthState(null));
    await act(async () => emitAuthState(testUser('user-2')));

    expect(await screen.findByText(/pending approval/i)).toBeInTheDocument();
  });
});
