import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider } from '@/contexts/AuthProvider';
import { ForgotPasswordScreen } from '@/features/auth/ForgotPasswordScreen';

const sendPasswordReset = vi.fn();

// Avoid real Firebase: unauthenticated state via a stubbed auth-service.
vi.mock('@/features/auth/auth-service', () => ({
  observeAuthState: (cb: (user: unknown) => void) => {
    cb(null);
    return () => {};
  },
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signOutUser: vi.fn(),
  sendPasswordReset: (email: string) => sendPasswordReset(email),
  syncUserClaims: vi.fn(() => Promise.resolve({ isAdmin: false, isOrganizer: false })),
}));

function renderScreen() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/forgot-password']}>
          <ForgotPasswordScreen />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    sendPasswordReset.mockReset();
  });

  it('submits the email to sendPasswordReset and shows a neutral success message', async () => {
    sendPasswordReset.mockResolvedValueOnce(undefined);
    renderScreen();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tech@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(sendPasswordReset).toHaveBeenCalledWith('tech@example.com'));
    expect(await screen.findByText(/a\s+password reset link has been sent/i)).toBeInTheDocument();
  });

  it('surfaces a generic error when the request fails (without revealing account existence)', async () => {
    sendPasswordReset.mockRejectedValueOnce(new Error('network'));
    renderScreen();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tech@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    // Failure must not flip into the success state.
    expect(screen.queryByText(/reset link has been sent/i)).not.toBeInTheDocument();
  });
});
