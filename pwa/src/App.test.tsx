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
  syncUserClaims: vi.fn(() => Promise.resolve({ isAdmin: false })),
}));

describe('App', () => {
  it('redirects unauthenticated users to the sign-in screen', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <App />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
