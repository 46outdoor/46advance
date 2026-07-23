import { completionPct, type StatusCounts } from '@/lib/tracker/tracker';

/**
 * Stacked progress bar: complete (green) · in progress (amber) · not started (grey),
 * with a percent-complete label. Read-only; colors match the section-status palette.
 */
export function CompletionBar({ counts }: { counts: StatusCounts }) {
  const pct = Math.round(completionPct(counts) * 100);
  const seg = (n: number) => (counts.total === 0 ? 0 : (n / counts.total) * 100);

  return (
    <div className="space-y-1">
      <div
        className="flex h-2 overflow-hidden rounded bg-status-none/20"
        role="img"
        aria-label={`${pct}% complete`}
      >
        <div className="bg-status-complete" style={{ width: `${seg(counts.complete)}%` }} />
        <div className="bg-status-progress" style={{ width: `${seg(counts.in_progress)}%` }} />
      </div>
      <div className="flex justify-between text-[0.7rem] text-ink-muted">
        <span>{pct}% complete</span>
        <span>
          {counts.complete}/{counts.total} sections
        </span>
      </div>
    </div>
  );
}
