import { useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';

/**
 * Gate protected routes: loading screen, redirect to /sign-in when unauthenticated, a
 * "verify your email" screen until the address is confirmed (no `admin`/`approved` claim
 * is granted server-side until then), and a "pending approval" screen for accounts an
 * admin hasn't yet approved (new-account approval gate).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, approved, emailVerified, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand text-brand-fg">
        <p className="font-sans text-sm uppercase tracking-[0.3em] opacity-70">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/sign-in" replace />;

  if (!emailVerified) return <VerifyEmailScreen email={user.email} />;

  if (!approved) {
    return (
      <AuthGateCard>
        <h1 className="font-display text-xl font-black tracking-tight text-brand">
          Account pending approval
        </h1>
        <p className="text-sm text-ink-muted">
          Your account ({user.email}) is awaiting admin approval. You’ll get access once an
          administrator approves it.
        </p>
        <SignOutButton onClick={signOut} />
      </AuthGateCard>
    );
  }

  return <>{children}</>;
}

/** Shared card chrome for the gate's interstitial screens. */
function AuthGateCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-brand p-6 text-brand-fg">
      <div className="flex items-end gap-2.5">
        <img src="/brand/46-mark-white.png" alt="" aria-hidden="true" className="h-12 w-auto" />
        <span className="pb-1 font-sans text-sm uppercase tracking-[0.3em]">Advance</span>
      </div>
      <div className="w-full max-w-sm space-y-3 rounded-lg bg-surface p-6 text-center text-ink shadow-xl">
        {children}
      </div>
    </div>
  );
}

function SignOutButton({ onClick }: { onClick: () => void | Promise<void> }) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
    >
      Sign out
    </button>
  );
}

/**
 * Shown to a signed-in user whose email isn't verified yet. Lets them resend the link and,
 * after they click it, re-check (reload + re-sync claims) without a full re-sign-in.
 */
function VerifyEmailScreen({ email }: { email: string | null }) {
  const { resendVerification, refreshUser, signOut } = useAuth();
  const [busy, setBusy] = useState<'resend' | 'check' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onResend() {
    setBusy('resend');
    setNotice(null);
    try {
      await resendVerification();
      setNotice('Verification email sent. Check your inbox (and spam).');
    } catch {
      setNotice('Could not send the email. Wait a moment and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function onCheck() {
    setBusy('check');
    setNotice(null);
    try {
      await refreshUser();
      // If still unverified, refreshUser leaves this screen mounted — tell the user.
      setNotice('Still not verified. Click the link in the email, then try again.');
    } catch {
      setNotice('Could not check verification status. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <AuthGateCard>
      <h1 className="font-display text-xl font-black tracking-tight text-brand">
        Verify your email
      </h1>
      <p className="text-sm text-ink-muted">
        We sent a verification link to {email ?? 'your email'}. Click it to activate your account,
        then continue.
      </p>
      {notice && <p className="text-sm text-ink-muted">{notice}</p>}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void onCheck()}
          disabled={busy !== null}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {busy === 'check' ? 'Checking…' : "I've verified — continue"}
        </button>
        <button
          type="button"
          onClick={() => void onResend()}
          disabled={busy !== null}
          className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {busy === 'resend' ? 'Sending…' : 'Resend email'}
        </button>
        <SignOutButton onClick={signOut} />
      </div>
    </AuthGateCard>
  );
}
