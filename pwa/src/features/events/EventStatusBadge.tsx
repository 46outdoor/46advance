import type { EventStatus } from '@/lib/events/event';

const STYLES: Record<EventStatus, string> = {
  draft: 'bg-surface-muted text-ink-muted',
  active: 'bg-status-complete/15 text-status-complete',
  archived: 'bg-ink-muted/10 text-ink-muted line-through',
};

/** Small lifecycle badge for an event's status (distinct from section status colors). */
export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${STYLES[status]}`}>
      {status}
    </span>
  );
}
