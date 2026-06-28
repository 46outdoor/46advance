import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
// Guards stay eager — they wrap the protected layout and are needed on first paint.
// Importing them from their module paths (not the feature barrels) keeps each barrel
// out of the initial chunk so its screens can split.
import { AuthGate } from '@/features/auth/AuthGate';
import { AdminGate } from '@/features/admin/AdminGate';

// Route screens are lazy-loaded so each feature ships in its own chunk and the
// initial bundle stays small (routing uses lazy code splitting).
const LandingScreen = lazy(() =>
  import('@/routes/LandingScreen').then((m) => ({ default: m.LandingScreen })),
);
const PrivacyScreen = lazy(() =>
  import('@/routes/PrivacyScreen').then((m) => ({ default: m.PrivacyScreen })),
);
const ThemeSpecimen = lazy(() =>
  import('@/routes/ThemeSpecimen').then((m) => ({ default: m.ThemeSpecimen })),
);

const SignInScreen = lazy(() => import('@/features/auth').then((m) => ({ default: m.SignInScreen })));
const SignUpScreen = lazy(() => import('@/features/auth').then((m) => ({ default: m.SignUpScreen })));
const ForgotPasswordScreen = lazy(() =>
  import('@/features/auth').then((m) => ({ default: m.ForgotPasswordScreen })),
);

const AdminScreen = lazy(() => import('@/features/admin').then((m) => ({ default: m.AdminScreen })));

const EventsListScreen = lazy(() =>
  import('@/features/events').then((m) => ({ default: m.EventsListScreen })),
);
const EventDetailScreen = lazy(() =>
  import('@/features/events').then((m) => ({ default: m.EventDetailScreen })),
);
const EventProductionScreen = lazy(() =>
  import('@/features/events').then((m) => ({ default: m.EventProductionScreen })),
);
const EventScheduleScreen = lazy(() =>
  import('@/features/events').then((m) => ({ default: m.EventScheduleScreen })),
);
const StageDetailScreen = lazy(() =>
  import('@/features/events').then((m) => ({ default: m.StageDetailScreen })),
);
const AdvanceDetailScreen = lazy(() =>
  import('@/features/events').then((m) => ({ default: m.AdvanceDetailScreen })),
);

const TemplatesListScreen = lazy(() =>
  import('@/features/templates').then((m) => ({ default: m.TemplatesListScreen })),
);
const TemplateEditorScreen = lazy(() =>
  import('@/features/templates').then((m) => ({ default: m.TemplateEditorScreen })),
);

const ScheduleTemplatesListScreen = lazy(() =>
  import('@/features/scheduleTemplates').then((m) => ({ default: m.ScheduleTemplatesListScreen })),
);
const ScheduleTemplateEditorScreen = lazy(() =>
  import('@/features/scheduleTemplates').then((m) => ({ default: m.ScheduleTemplateEditorScreen })),
);

const TrackerOverviewScreen = lazy(() =>
  import('@/features/tracker').then((m) => ({ default: m.TrackerOverviewScreen })),
);
const EventTrackerScreen = lazy(() =>
  import('@/features/tracker').then((m) => ({ default: m.EventTrackerScreen })),
);

const ContactsDirectoryScreen = lazy(() =>
  import('@/features/contacts').then((m) => ({ default: m.ContactsDirectoryScreen })),
);

const DocumentsScreen = lazy(() =>
  import('@/features/documents').then((m) => ({ default: m.DocumentsScreen })),
);
const ArtistDocumentsScreen = lazy(() =>
  import('@/features/documents').then((m) => ({ default: m.ArtistDocumentsScreen })),
);

const SettingsScreen = lazy(() =>
  import('@/features/google').then((m) => ({ default: m.SettingsScreen })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingScreen />} />
        <Route path="/sign-in" element={<SignInScreen />} />
        <Route path="/sign-up" element={<SignUpScreen />} />
        <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
        <Route path="/privacy" element={<PrivacyScreen />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/events" element={<EventsListScreen />} />
          <Route path="/events/:eventId" element={<EventDetailScreen />} />
          <Route path="/events/:eventId/production" element={<EventProductionScreen />} />
          <Route path="/events/:eventId/schedule" element={<EventScheduleScreen />} />
          <Route path="/tracker" element={<TrackerOverviewScreen />} />
          <Route path="/tracker/:eventId" element={<EventTrackerScreen />} />
          <Route path="/contacts" element={<ContactsDirectoryScreen />} />
          <Route path="/documents" element={<DocumentsScreen />} />
          <Route path="/documents/artists/:artistKey" element={<ArtistDocumentsScreen />} />
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
          <Route
            path="/schedule-templates"
            element={
              <AdminGate>
                <ScheduleTemplatesListScreen />
              </AdminGate>
            }
          />
          <Route
            path="/schedule-templates/:id"
            element={
              <AdminGate>
                <ScheduleTemplateEditorScreen />
              </AdminGate>
            }
          />
          {/* Dev-only specimen route; never registered in production bundles. */}
          {import.meta.env.DEV && <Route path="/__theme" element={<ThemeSpecimen />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function ProtectedLayout() {
  return (
    <AuthGate>
      <AppShell>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </AppShell>
    </AuthGate>
  );
}
