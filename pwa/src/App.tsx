import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ThemeSpecimen } from '@/routes/ThemeSpecimen';
import { SignInScreen, SignUpScreen, AuthGate } from '@/features/auth';
import { AdminScreen, AdminGate } from '@/features/admin';
import {
  EventsListScreen,
  EventDetailScreen,
  EventProductionScreen,
  StageDetailScreen,
  AdvanceDetailScreen,
} from '@/features/events';
import { TemplatesListScreen, TemplateEditorScreen } from '@/features/templates';
import { TrackerOverviewScreen, EventTrackerScreen } from '@/features/tracker';
import { ContactsDirectoryScreen } from '@/features/contacts';
import { SettingsScreen } from '@/features/google';

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInScreen />} />
      <Route path="/sign-up" element={<SignUpScreen />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/events" element={<EventsListScreen />} />
        <Route path="/events/:eventId" element={<EventDetailScreen />} />
        <Route path="/events/:eventId/production" element={<EventProductionScreen />} />
        <Route path="/tracker" element={<TrackerOverviewScreen />} />
        <Route path="/tracker/:eventId" element={<EventTrackerScreen />} />
        <Route path="/contacts" element={<ContactsDirectoryScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/events/:eventId/stages/:stageId" element={<StageDetailScreen />} />
        <Route
          path="/events/:eventId/stages/:stageId/advances/:advanceId"
          element={<AdvanceDetailScreen />}
        />
        <Route
          path="/admin"
          element={
            <AdminGate>
              <AdminScreen />
            </AdminGate>
          }
        />
        <Route
          path="/templates"
          element={
            <AdminGate>
              <TemplatesListScreen />
            </AdminGate>
          }
        />
        <Route
          path="/templates/:templateId"
          element={
            <AdminGate>
              <TemplateEditorScreen />
            </AdminGate>
          }
        />
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
