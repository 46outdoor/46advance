import { Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { lazyWithRetry } from '@/lib/pwa/lazyWithRetry';
// Guards stay eager — they wrap the protected layout and are needed on first paint.
// Importing them from their module paths (not the feature barrels) keeps each barrel
// out of the initial chunk so its screens can split.
import { AuthGate } from '@/features/auth/AuthGate';
import { AdminGate } from '@/features/admin/AdminGate';

// Route screens are lazy-loaded so each feature ships in its own chunk and the
// initial bundle stays small (routing uses lazy code splitting).
const LandingScreen = lazyWithRetry(() =>
  import('@/routes/LandingScreen').then((m) => ({ default: m.LandingScreen })),
);
const PrivacyScreen = lazyWithRetry(() =>
  import('@/routes/PrivacyScreen').then((m) => ({ default: m.PrivacyScreen })),
);
// Dev-only theme specimen: gated on DEV so Vite drops the import (and its chunk) from prod (WS-L).
const ThemeSpecimen = import.meta.env.DEV
  ? lazyWithRetry(() =>
      import('@/routes/ThemeSpecimen').then((m) => ({ default: m.ThemeSpecimen })),
    )
  : null;

// Screens import from their MODULE paths (not the feature barrels) so each route splits into its own
// chunk — importing a barrel pulls every screen in that feature into one chunk (WS-L).
const SignInScreen = lazyWithRetry(() =>
  import('@/features/auth/SignInScreen').then((m) => ({ default: m.SignInScreen })),
);
const SignUpScreen = lazyWithRetry(() =>
  import('@/features/auth/SignUpScreen').then((m) => ({ default: m.SignUpScreen })),
);
const ForgotPasswordScreen = lazyWithRetry(() =>
  import('@/features/auth/ForgotPasswordScreen').then((m) => ({ default: m.ForgotPasswordScreen })),
);

const AdminScreen = lazyWithRetry(() =>
  import('@/features/admin/AdminScreen').then((m) => ({ default: m.AdminScreen })),
);

const EventsListScreen = lazyWithRetry(() =>
  import('@/features/events/EventsListScreen').then((m) => ({ default: m.EventsListScreen })),
);
const EventDetailScreen = lazyWithRetry(() =>
  import('@/features/events/EventDetailScreen').then((m) => ({ default: m.EventDetailScreen })),
);
const EventProductionScreen = lazyWithRetry(() =>
  import('@/features/events/EventProductionScreen').then((m) => ({
    default: m.EventProductionScreen,
  })),
);
const EventScheduleScreen = lazyWithRetry(() =>
  import('@/features/events/EventScheduleScreen').then((m) => ({ default: m.EventScheduleScreen })),
);
const EventDocumentsScreen = lazyWithRetry(() =>
  import('@/features/events/EventDocumentsScreen').then((m) => ({
    default: m.EventDocumentsScreen,
  })),
);
const StageDetailScreen = lazyWithRetry(() =>
  import('@/features/events/StageDetailScreen').then((m) => ({ default: m.StageDetailScreen })),
);
const AdvanceDetailScreen = lazyWithRetry(() =>
  import('@/features/events/AdvanceDetailScreen').then((m) => ({ default: m.AdvanceDetailScreen })),
);

const TemplatesListScreen = lazyWithRetry(() =>
  import('@/features/templates/TemplatesListScreen').then((m) => ({
    default: m.TemplatesListScreen,
  })),
);
const TemplateEditorScreen = lazyWithRetry(() =>
  import('@/features/templates/TemplateEditorScreen').then((m) => ({
    default: m.TemplateEditorScreen,
  })),
);

const ScheduleTemplatesListScreen = lazyWithRetry(() =>
  import('@/features/scheduleTemplates/ScheduleTemplatesListScreen').then((m) => ({
    default: m.ScheduleTemplatesListScreen,
  })),
);
const ScheduleTemplateEditorScreen = lazyWithRetry(() =>
  import('@/features/scheduleTemplates/ScheduleTemplateEditorScreen').then((m) => ({
    default: m.ScheduleTemplateEditorScreen,
  })),
);

const TrackerOverviewScreen = lazyWithRetry(() =>
  import('@/features/tracker/TrackerOverviewScreen').then((m) => ({
    default: m.TrackerOverviewScreen,
  })),
);
const EventTrackerScreen = lazyWithRetry(() =>
  import('@/features/tracker/EventTrackerScreen').then((m) => ({ default: m.EventTrackerScreen })),
);

const ContactsDirectoryScreen = lazyWithRetry(() =>
  import('@/features/contacts/ContactsDirectoryScreen').then((m) => ({
    default: m.ContactsDirectoryScreen,
  })),
);

const DocumentsScreen = lazyWithRetry(() =>
  import('@/features/documents/DocumentsScreen').then((m) => ({ default: m.DocumentsScreen })),
);
const ArtistDocumentsScreen = lazyWithRetry(() =>
  import('@/features/documents/ArtistDocumentsScreen').then((m) => ({
    default: m.ArtistDocumentsScreen,
  })),
);

const SettingsScreen = lazyWithRetry(() =>
  import('@/features/google/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
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
          <Route path="/events/:eventId/documents" element={<EventDocumentsScreen />} />
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
          {import.meta.env.DEV && ThemeSpecimen && (
            <Route path="/__theme" element={<ThemeSpecimen />} />
          )}
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
        <RouteErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </RouteErrorBoundary>
      </AppShell>
    </AuthGate>
  );
}
