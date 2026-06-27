import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { AuthLayout, Field } from '@/features/auth/AuthLayout';

const logger = createLogger('Auth');

export function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');

  const reset = useMutation({
    mutationFn: (address: string) => resetPassword(address),
    // Never surface whether the address exists — log for ourselves, show neutral success.
    onError: (err) => logger.error('Password reset request failed', err),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    reset.mutate(email);
  }

  if (reset.isSuccess) {
    return (
      <AuthLayout title="Check your email">
        <p className="text-sm text-ink-muted">
          If an account exists for <span className="font-semibold text-ink">{email}</span>, a
          password reset link has been sent. Follow the link in that email to choose a new password.
        </p>
        <p className="mt-4 text-sm text-ink-muted">
          <Link className="text-accent underline" to="/sign-in">
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset password">
      <p className="mb-4 text-sm text-ink-muted">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        {reset.isError && (
          <p className="text-sm text-accent">Something went wrong. Please try again.</p>
        )}
        <button
          type="submit"
          disabled={reset.isPending}
          className="w-full rounded bg-accent px-4 py-2 font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {reset.isPending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink-muted">
        Remembered it?{' '}
        <Link className="text-accent underline" to="/sign-in">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
