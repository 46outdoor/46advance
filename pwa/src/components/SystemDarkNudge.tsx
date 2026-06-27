import { useTheme } from '@/contexts/theme-context';

/**
 * One-time, dismissible banner shown when the OS prefers dark but no theme choice
 * is saved yet (default is light). Either action records a choice so it never
 * reappears.
 */
export function SystemDarkNudge() {
  const { showSystemDarkNudge, setTheme } = useTheme();
  if (!showSystemDarkNudge) return null;

  return (
    <div className="border-b border-line bg-surface-muted px-4 py-2 text-sm text-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <span>Your system is set to dark mode — switch 46 Advance to dark?</span>
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Switch to dark
          </button>
          <button
            type="button"
            onClick={() => setTheme('light')}
            className="rounded border border-line px-3 py-1 text-xs transition-colors hover:border-accent hover:text-accent"
          >
            Keep light
          </button>
        </span>
      </div>
    </div>
  );
}
