import type { SectionStatus } from '@/lib/advances/sections';

const STYLES: Record<SectionStatus, string> = {
  not_started: 'bg-status-none/15 text-ink-muted',
  in_progress: 'bg-status-progress/15 text-status-progress',
  complete: 'bg-status-complete/15 text-status-complete',
};

const LABELS: Record<SectionStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
};

/** Section status pill: neutral → amber → green (never red — that's brand). */
export function SectionStatusBadge({ status }: { status: SectionStatus }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
