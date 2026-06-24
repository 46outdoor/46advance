/**
 * Per-user settings (Phase 11b): integrations the signed-in user manages for themselves.
 * Currently hosts the Google Calendar connection. Any signed-in user can reach this; the
 * actions only affect their own account.
 */
import { GoogleConnectCard } from './GoogleConnectCard';

export function SettingsScreen() {
  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-black tracking-tight text-brand">Settings</h1>
        <p className="text-sm text-ink-muted">Integrations connected to your account.</p>
      </header>

      <div className="space-y-4">
        <h2 className="font-display text-xl font-bold text-brand">Integrations</h2>
        <GoogleConnectCard />
      </div>
    </section>
  );
}
