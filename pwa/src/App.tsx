import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ThemeSpecimen } from '@/routes/ThemeSpecimen';
import { PrivacyScreen } from '@/routes/PrivacyScreen';
import { LandingScreen } from '@/routes/LandingScreen';
import { SignInScreen, SignUpScreen, ForgotPasswordScreen, AuthGate } from '@/features/auth';
import { AdminScreen, AdminGate } from '@/features/admin';
import {
  EventsListScreen,
  EventDetailScreen,
  EventProductionScreen,
  EventScheduleScreen,
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
        {/* Dev-only specimen route; never registered in production bundles. */}
        {import.meta.env.DEV && <Route path="/__theme" element={<ThemeSpecimen />} />}
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

