import { Link } from 'react-router-dom';

/** Admin: entry point to the schedule-template editor (schedule templates have their own screen). */
export function ScheduleTemplatesAdmin() {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold text-brand">Schedule templates</h2>
      <div className="rounded-lg border border-line p-4">
        <p className="text-sm text-ink-muted">
          Reusable schedule blueprints (Production, Show, Stagehand…) you can import into any
          event's schedule.
        </p>
        <Link
          to="/schedule-templates"
          className="mt-3 inline-block rounded border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Manage schedule templates
        </Link>
      </div>
    </div>
  );
}
