/**
 * Cautions for a packet that generated but rendered degraded. Extracted from EventDetailScreen
 * (which sits past the 500-line advisory limit) — self-contained presentation, no event coupling.
 */

/** Longest Storage path shown in full; past this the directories are elided, never the filename. */
const MAX_PATH_CHARS = 48;

/**
 * Split a server warning into its prose and the Storage path it names. The path is always the
 * trailing `: <path>` segment — a slash-bearing token with no spaces — so warnings that name no
 * file (e.g. "The packet was generated without an event logo.") come back with `path: null`.
 */
function splitWarningPath(warning: string): { text: string; path: string | null } {
  const at = warning.lastIndexOf(': ');
  if (at === -1) return { text: warning, path: null };
  const tail = warning.slice(at + 2).trim();
  if (!tail.includes('/') || /\s/.test(tail)) return { text: warning, path: null };
  return { text: warning.slice(0, at), path: tail };
}

/**
 * Middle-truncate a Storage path, dropping directories from the middle and keeping the whole
 * filename — the filename is what tells a PM *which* image to re-upload, so it never gets cut.
 */
function shortenPath(path: string): string {
  if (path.length <= MAX_PATH_CHARS) return path;
  const slash = path.lastIndexOf('/');
  if (slash === -1) return path;
  const file = path.slice(slash + 1);
  const head = path.slice(0, Math.max(0, MAX_PATH_CHARS - file.length - 2)).replace(/\/+$/, '');
  return head ? `${head}…/${file}` : `…/${file}`;
}

interface PacketWarningsProps {
  warnings: string[];
  onDismiss: () => void;
}

/**
 * Cautions for a packet that generated but rendered *degraded* — most often a logo the PDF
 * renderer couldn't embed (it takes PNG/JPEG only, so a WebP saved as `.png` decodes to nothing
 * and the mark silently vanishes). Amber, not accent-red: the packet is valid and already open.
 * The wrapper renders even when empty so the live region exists in the DOM before the async
 * generate resolves — a region inserted together with its text isn't reliably announced.
 */
export function PacketWarnings({ warnings, onDismiss }: PacketWarningsProps) {
  return (
    <div role="status" aria-live="polite">
      {warnings.length > 0 && (
        <div className="mt-2 rounded border border-status-progress/40 bg-status-progress/10 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-ink">
              The packet generated, but something was left out
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="-my-2 -mr-2 min-h-[44px] min-w-[44px] shrink-0 rounded px-3 text-sm text-ink-muted transition-colors hover:text-accent"
            >
              Dismiss
            </button>
          </div>
          <ul className="mt-1 space-y-2">
            {warnings.map((warning, index) => {
              const { text, path } = splitWarningPath(warning);
              return (
                <li key={`${index}-${warning}`} className="text-sm text-ink-muted">
                  {text}
                  {path && (
                    <span
                      title={path}
                      className="mt-0.5 block font-mono text-xs break-all text-ink-muted/80"
                    >
                      {shortenPath(path)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
