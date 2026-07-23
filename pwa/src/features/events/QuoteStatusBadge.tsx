import { QUOTE_STATUS_LABELS, type QuoteStatus } from '@/lib/quotes/quote';

// Quote status is its own lifecycle (not the section tracker palette). Red stays brand,
// so "rejected" uses a neutral struck style rather than a red status color.
const STYLES: Record<QuoteStatus, string> = {
  draft: 'bg-status-none/20 text-ink-muted',
  sent: 'bg-status-progress/15 text-status-progress',
  approved: 'bg-status-complete/15 text-status-complete',
  rejected: 'bg-ink/10 text-ink-muted line-through',
};

/** Quote lifecycle pill: draft · sent · approved · rejected. */
export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${STYLES[status]}`}
    >
      {QUOTE_STATUS_LABELS[status]}
    </span>
  );
}
