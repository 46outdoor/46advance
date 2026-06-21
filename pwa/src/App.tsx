import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ThemeSpecimen } from '@/routes/ThemeSpecimen';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/__theme" element={<ThemeSpecimen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function Home() {
  return (
    <section className="space-y-3">
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-brand">46 Advance</h1>
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
