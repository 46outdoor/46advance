import { Link } from 'react-router-dom';
import type { SectionStatus } from '@/lib/advances/sections';
import { formatDate } from '@/lib/dates/formatting';
import type { EventTracker } from '@/lib/tracker/tracker';

/** Cell appearance per status; null = the advance has no section for that department. */
const CELL: Record<SectionStatus, { className: string; glyph: string; label: string }> = {
  not_started: { className: 'bg-status-none/20 text-ink-muted', glyph: '·', label: 'Not started' },
  in_progress: { className: 'bg-status-progress/25 text-status-progress', glyph: '◐', label: 'In progress' },
  complete: { className: 'bg-status-complete/25 text-status-complete', glyph: '✓', label: 'Complete' },
};

function StatusCell({ status }: { status: SectionStatus | null }) {
  if (!status) {
    return (
      <td className="border border-line/60 text-center text-line" aria-label="No section">
        –
      </td>
    );
  }
  const c = CELL[status];
  return (
    <td className={`border border-line/60 text-center text-sm font-semibold ${c.className}`} title={c.label}>
      <span aria-hidden="true">{c.glyph}</span>
      <span className="sr-only">{c.label}</span>
    </td>
  );
}

/**
 * Read-only advances × departments grid for one event. Rows are advances (grouped by
 * stage); columns are the event's departments; cells are status-colored. Row label links
 * to the advance.
 */
export function TrackerGrid({ eventId, tracker }: { eventId: string; tracker: EventTracker }) {
  if (tracker.rows.length === 0) {
    return <p className="text-sm text-ink-muted">No artist advances yet — add stages and advances to populate the tracker.</p>;
  }
  if (tracker.columns.length === 0) {
    return <p className="text-sm text-ink-muted">This event has no departments enabled, so there are no sections to track.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-semibold text-brand">Advance</th>
            {tracker.columns.map((col) => (
              <th key={col.id} className="border border-line/60 px-2 py-2 text-center text-xs font-semibold text-ink-muted">
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tracker.rows.map((row) => (
            <tr key={`${row.stageId}-${row.advanceId}`} className="hover:bg-surface-muted/40">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2 py-1.5">
                <Link
                  to={`/events/${eventId}/stages/${row.stageId}/advances/${row.advanceId}`}
                  className="font-medium text-ink hover:text-accent"
                >
                  {row.artistName}
                </Link>
                <span className="ml-2 text-xs text-ink-muted">
                  {row.stageName}
                  {row.performanceDate ? ` · ${formatDate(row.performanceDate)}` : ''}
                </span>
              </td>
              {tracker.columns.map((col) => (
                <StatusCell key={col.id} status={row.cells[col.id] ?? null} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
