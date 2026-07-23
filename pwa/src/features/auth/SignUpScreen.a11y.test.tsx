import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { axe } from 'jest-axe';
import { AuthProvider } from '@/contexts/AuthProvider';
import { SignUpScreen } from '@/features/auth/SignUpScreen';

// Automated accessibility check (WS-L). A foundation harness on a key screen — extend to more
// authenticated screens over time. Firebase is stubbed via the auth-service mock (unauthenticated).
vi.mock('@/features/auth/auth-service', () => ({
  observeAuthState: (cb: (u: unknown) => void) => {
    cb(null);
    return () => {};
  },
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signOutUser: vi.fn(),
  sendPasswordReset: vi.fn(),
  syncUserClaims: vi.fn(() => Promise.resolve({ isAdmin: false, isOrganizer: false })),
}));

describe('SignUpScreen accessibility', () => {
  it('has no axe-detectable violations', async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/sign-up']}>
            <SignUpScreen />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
    // color-contrast needs real layout/paint (jsdom has none), so disable just that rule.
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
