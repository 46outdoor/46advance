import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ThemeSpecimen } from '@/routes/ThemeSpecimen';
import { SignInScreen, SignUpScreen, AuthGate } from '@/features/auth';

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInScreen />} />
      <Route path="/sign-up" element={<SignUpScreen />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/__theme" element={<ThemeSpecimen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function ProtectedLayout() {
  return (
    <AuthGate>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthGate>
  );
}

function Home() {
  return (
    <section className="space-y-3">
      <h1 className="font-display text-4xl font-black tracking-tight text-brand">46 Advance</h1>
      <p className="text-ink-muted">
        Foundation scaffold (Phase 0) — festival artist advance management for 46 Entertainment.
      </p>
      <p className="text-sm text-ink-muted">
        Design tokens preview at{' '}
        <a className="text-accent underline" href="/__theme">
          /__theme
        </a>
        .
      </p>
    </section>
  );
}
