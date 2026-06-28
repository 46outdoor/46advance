/**
 * Per-user settings (Phase 11b): preferences and integrations the signed-in user manages for
 * themselves — appearance (light/dark theme) and the Google Calendar connection. Any signed-in
 * user can reach this; the actions only affect their own account.
 */
import { ThemeSetting } from '@/components/ThemeSetting';
import { ProfilePhotoSection } from './ProfilePhotoSection';
import { GoogleConnectCard } from './GoogleConnectCard';

export function SettingsScreen() {
  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-black tracking-tight text-brand">Settings</h1>
        <p className="text-sm text-ink-muted">Preferences and integrations for your account.</p>
      </header>

      <ProfilePhotoSection />

      <div className="space-y-4">
        <h2 className="font-display text-xl font-bold text-brand">Appearance</h2>
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">Choose a light or dark theme for the app.</p>
          <ThemeSetting />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-xl font-bold text-brand">Integrations</h2>
        <GoogleConnectCard />
      </div>
    </section>
  );
}
