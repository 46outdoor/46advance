/**
 * Public landing page at `/` (no auth) — the app's home page. Required for Google OAuth
 * verification: the home page must be publicly viewable (not behind login) and explain what
 * the app does. Signed-in users are routed straight into the app.
 */
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';

const FEATURES = [
  'Artist advances and production details',
  'Quotes, approvals, and signed PDFs',
  'Contacts directory and per-event attachments',
  'Advance tracker across events and departments',
  'Google Calendar + Meet advance calls (create or auto-match bookings)',
];

export function LandingScreen() {
  const { user } = useAuth();
  // Render the public description immediately (even while auth initializes) so crawlers —
  // including Google's OAuth verifier — never see a blank frame. Only signed-in users redirect.
  if (user) return <Navigate to="/events" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-brand text-brand-fg">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-16">
        <div className="space-y-4">
          <div className="flex items-end gap-2.5">
            <img src="/brand/46-mark-white.png" alt="" aria-hidden="true" className="h-12 w-auto" />
            <span className="pb-1 font-sans text-sm uppercase tracking-[0.3em]">Advance</span>
          </div>
          <h1 className="font-display text-4xl font-black tracking-tight sm:text-5xl">
            46 Advance
          </h1>
          <p className="max-w-2xl text-lg text-brand-fg/80">
            Event-production advance management for 46 Entertainment. 46 Advance is the internal
            tool our production team uses to organize artist advances, production details, quotes,
            contacts, and scheduling — including Google Calendar and Google Meet "advance calls" —
            for live events and festivals.
          </p>
        </div>

        <ul className="grid gap-2 text-brand-fg/70 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden="true"
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
              />
              {f}
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-4">
          <Link
            to="/sign-in"
            className="rounded bg-accent px-5 py-2.5 font-semibold text-white transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
          <span className="text-sm text-brand-fg/50">
            Staff and authorized production personnel.
          </span>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-6 pb-8 text-xs text-brand-fg/50">
        <Link to="/privacy" className="underline hover:text-brand-fg">
          Privacy Policy
        </Link>
        <span className="mx-2">·</span>
        <a className="hover:text-brand-fg" href="mailto:jared@46entertainment.com">
          Contact
        </a>
      </footer>
    </div>
  );
}
