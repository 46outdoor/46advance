import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './auth-context';
import { AuthGate } from '@/features/auth/AuthGate';
import type { User } from '@/features/auth/auth-service';
import type { SyncUserClaimsOutput } from '@contracts/callables/auth';

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

/**
 * A callable response. `Partial` on purpose: the client never `.parse()`s callable output, so a
 * Functions deploy older than the client legitimately omits fields — which is exactly the
 * compatibility case the provider has to normalize.
 */
type ClaimsResponse = Partial<SyncUserClaimsOutput>;

/** Minimal User: the fields AuthProvider and AuthGate actually read. */
const testUser = (uid: string, claims: Record<string, unknown> = {}) =>
  ({
    uid,
    email: `${uid}@example.com`,
    emailVerified: true,
    getIdToken: vi.fn().mockResolvedValue('token'),
    getIdTokenResult: vi.fn().mockResolvedValue({ claims }),
  }) as unknown as User;

/**
 * Renders each resolved claim through `String()` so the assertions can tell `false` apart from
 * `undefined` — the whole point of the compatibility guard. A `toBeFalsy()` check would pass on
 * both and prove nothing.
 */
function ClaimProbe() {
  const { isAdmin, isOrganizer, isProductionDirector } = useAuth();
  return (
    <ul>
      <li data-testid="claim-admin">{String(isAdmin)}</li>
      <li data-testid="claim-organizer">{String(isOrganizer)}</li>
      <li data-testid="claim-director">{String(isProductionDirector)}</li>
    </ul>
  );
}

/** The exact string the provider exposes for the director claim (never a coerced boolean). */
const directorText = () => screen.getByTestId('claim-director').textContent;

function renderGate() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AuthProvider>
          <ClaimProbe />
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
    let resolveClaims: (v: ClaimsResponse) => void = () => {};
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
      resolveClaims({
        isAdmin: false,
        isOrganizer: false,
        isProductionDirector: false,
        approved: true,
      });
    });

    expect(screen.getByText('Signed in content')).toBeInTheDocument();
  });

  it('still shows "pending approval" once claims confirm the account is not approved', async () => {
    syncUserClaims.mockResolvedValue({
      isAdmin: false,
      isOrganizer: false,
      isProductionDirector: false,
      approved: false,
    } satisfies ClaimsResponse);

    renderGate();
    await act(async () => emitAuthState(null));
    await act(async () => emitAuthState(testUser('user-2')));

    expect(await screen.findByText(/pending approval/i)).toBeInTheDocument();
  });
});

describe('AuthProvider — production-director claim', () => {
  async function signIn(user: User) {
    renderGate();
    await act(async () => emitAuthState(null));
    await act(async () => emitAuthState(user));
  }

  it('exposes the claim from the callable response', async () => {
    syncUserClaims.mockResolvedValue({
      isAdmin: false,
      isOrganizer: false,
      isProductionDirector: true,
      approved: true,
    } satisfies ClaimsResponse);

    await signIn(testUser('director-1'));

    expect(directorText()).toBe('true');
    expect(screen.getByTestId('claim-admin').textContent).toBe('false');
  });

  /**
   * THE COMPATIBILITY GUARD. `syncUserClaimsOutputSchema` declares
   * `isProductionDirector: z.boolean().default(false)`, but that default only fires under
   * `.parse()` — and the client never parses callable output: `syncUserClaims()` returns
   * `result.data` raw and `applyClaims` destructures it. So this asserts the REAL client path
   * (mocked callable → AuthProvider → context value), not `schema.parse`; a schema-level test
   * would pass while the browser still received `undefined`.
   *
   * The response below is what an older Functions deploy sends: no `isProductionDirector` key.
   */
  it('normalizes a response that omits the field to false, never undefined', async () => {
    syncUserClaims.mockResolvedValue({
      isAdmin: false,
      isOrganizer: false,
      approved: true,
    } satisfies ClaimsResponse);

    await signIn(testUser('legacy-1'));

    expect(directorText()).toBe('false');
    expect(directorText()).not.toBe('undefined');
    // The rest of the app still works against the older backend.
    expect(screen.getByText('Signed in content')).toBeInTheDocument();
  });

  it('falls back to the cached token claim when the callable fails', async () => {
    syncUserClaims.mockRejectedValue(new Error('functions unreachable'));

    await signIn(testUser('director-2', { approved: true, productionDirector: true }));

    expect(directorText()).toBe('true');
  });

  it('resolves false from a cached token that carries no director claim', async () => {
    syncUserClaims.mockRejectedValue(new Error('functions unreachable'));

    await signIn(testUser('user-3', { approved: true }));

    expect(directorText()).toBe('false');
  });

  it('resets the claim on sign-out', async () => {
    syncUserClaims.mockResolvedValue({
      isAdmin: false,
      isOrganizer: false,
      isProductionDirector: true,
      approved: true,
    } satisfies ClaimsResponse);

    await signIn(testUser('director-3'));
    expect(directorText()).toBe('true');

    await act(async () => emitAuthState(null));

    expect(directorText()).toBe('false');
  });

  it('does not leak the prior identity’s claim across an account switch', async () => {
    syncUserClaims
      .mockResolvedValueOnce({
        isAdmin: false,
        isOrganizer: false,
        isProductionDirector: true,
        approved: true,
      } satisfies ClaimsResponse)
      .mockResolvedValueOnce({
        isAdmin: false,
        isOrganizer: false,
        isProductionDirector: false,
        approved: true,
      } satisfies ClaimsResponse);

    await signIn(testUser('director-4'));
    expect(directorText()).toBe('true');

    // Direct switch on a shared browser — no signed-out step in between.
    await act(async () => emitAuthState(testUser('user-4')));

    expect(directorText()).toBe('false');
  });
});
