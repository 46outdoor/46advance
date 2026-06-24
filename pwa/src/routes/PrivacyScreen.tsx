/**
 * Public privacy policy (no auth) — required for Google OAuth verification. Reachable at
 * /privacy and linked from the sign-in screen + app footer. Covers the Google Calendar
 * scopes the app uses and includes the Google API Services Limited Use disclosure.
 */
import { Link } from 'react-router-dom';

const LAST_UPDATED = 'June 24, 2026';
const CONTACT_EMAIL = 'jared@46entertainment.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl font-bold text-brand">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
}

export function PrivacyScreen() {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="bg-brand py-5 text-brand-fg">
        <div className="mx-auto flex max-w-3xl items-center px-4">
          <Link to="/" className="inline-flex items-end gap-2.5" aria-label="46 Advance — home">
            <img src="/brand/46-mark-white.png" alt="" aria-hidden="true" className="h-10 w-auto" />
            <span className="pb-1 font-sans text-sm uppercase tracking-[0.3em]">Advance</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-12">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-black tracking-tight text-brand">Privacy Policy</h1>
          <p className="text-sm text-ink-muted">Last updated: {LAST_UPDATED}</p>
        </div>

        <Section title="Overview">
          <p>
            46 Advance is an internal event-production tool operated by 46 Entertainment ("we",
            "us") for managing artist advances, production details, and "advance calls" for live
            events. This policy explains what information the app accesses when you connect a Google
            account, how we use it, and the choices you have. The app is used by 46 Entertainment
            staff and authorized production personnel.
          </p>
        </Section>

        <Section title="Information we access">
          <p>When you sign in and connect your Google account, we access:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Basic account info</strong> (your email address and name) to identify your
              account and connection status.
            </li>
            <li>
              <strong>Google Calendar</strong> (scopes{' '}
              <code className="rounded bg-surface-muted px-1">calendar</code> and{' '}
              <code className="rounded bg-surface-muted px-1">calendar.events</code>) to create and
              manage event calendars and advance-call meetings on your behalf, and to read your
              calendar to detect advance-call bookings.
            </li>
          </ul>
        </Section>

        <Section title="How we use it">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Create a dedicated Google Calendar per event and create calendar events with Google
              Meet links for advance calls, on your behalf.
            </li>
            <li>
              Read your calendar to detect advance-call bookings made through a Google Appointment
              Schedule link and attach the meeting link and time to the matching advance in the app.
            </li>
            <li>
              Perform these actions during scheduled background syncs using offline access, so booked
              calls attach automatically.
            </li>
          </ul>
          <p>
            We only access the connected user's own calendar. We do not read or store calendar data
            beyond what is needed to provide these features.
          </p>
        </Section>

        <Section title="How we store and protect it">
          <p>
            Google access and refresh tokens are stored server-side in restricted records that are
            never readable by other users or the browser, using Google Cloud / Firebase
            infrastructure. Advance-call times and meeting links are stored with the relevant event
            record, accessible only to authorized members of that event.
          </p>
        </Section>

        <Section title="Sharing and disclosure">
          <p>
            We do not sell your data, use it for advertising, or share it with third parties. Data is
            processed only by our infrastructure providers (Google Cloud Platform / Firebase) to
            operate the app.
          </p>
          <p>
            46 Advance's use and transfer of information received from Google APIs to any other app
            will adhere to the{' '}
            <a
              className="text-accent underline"
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="Data retention and your choices">
          <p>
            You can disconnect Google at any time from <strong>Settings → Google Calendar →
            Disconnect</strong>. Disconnecting revokes the app's access and deletes the stored
            tokens. Calendar events and Meet links already created remain on your Google Calendar and
            are managed there. If your account is removed, associated connection data is deleted.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data? Email{' '}
            <a className="text-accent underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <p className="border-t border-line pt-6 text-sm text-ink-muted">
          <Link to="/" className="text-accent hover:underline">
            ← Back to 46 Advance
          </Link>
        </p>
      </main>
    </div>
  );
}
