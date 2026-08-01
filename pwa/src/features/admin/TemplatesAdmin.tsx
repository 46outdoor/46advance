import { Link } from 'react-router-dom';

/** Admin: entry point to the event-template editor (templates have their own screen). */
export function TemplatesAdmin() {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold text-brand">Templates</h2>
      <div className="rounded-lg border border-line p-4">
        <p className="text-sm text-ink-muted">
          Blueprints for new events — seed departments, stages, production defaults, and roles.
        </p>
        <Link
          to="/templates"
          className="mt-3 inline-block rounded border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Manage templates
        </Link>
      </div>
    </div>
  );
}
