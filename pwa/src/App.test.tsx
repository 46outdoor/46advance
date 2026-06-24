import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { AuthProvider } from '@/contexts/AuthProvider';
import { App } from '@/App';

// Avoid real Firebase: unauthenticated state via a stubbed auth-service.
vi.mock('@/features/auth/auth-service', () => ({
  observeAuthState: (cb: (user: unknown) => void) => {
    cb(null);
    return () => {};
  },
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signOutUser: vi.fn(),
  sendPasswordReset: vi.fn(),
  syncUserClaims: vi.fn(() => Promise.resolve({ isAdmin: false, isOrganizer: false })),
}));

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it('shows the public landing page (not a login wall) at the home page', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: '46 Advance' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('redirects unauthenticated users away from protected routes to sign-in', () => {
    renderAt('/events');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
