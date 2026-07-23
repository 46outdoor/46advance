import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { AuthLayout, Field } from '@/features/auth/AuthLayout';

export function SignUpScreen() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await signUp(email, password, name);
      navigate('/', { replace: true });
    } catch {
      setError('Could not create the account. The email may already be in use.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create account">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Name" type="text" value={name} onChange={setName} autoComplete="name" />
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        {error && <p className="text-sm text-accent">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-accent px-4 py-2 font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink-muted">
        Already have an account?{' '}
        <Link className="text-accent underline" to="/sign-in">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
