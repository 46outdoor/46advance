/**
 * Admin: the labor crew-type list (`config/crewTypes`) offered on schedule crew lines —
 * Stagehands, Riggers / Climbers, … (planning/archive/feature/SCHEDULE_REDESIGN.md decision 21).
 * Follows the BrandingAdmin pattern: local draft, explicit save.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { crewTypesKey, getCrewTypes, setCrewTypes } from '@/lib/schedules/crew-types-service';

const logger = createLogger('CrewTypes');

const inputClass =
  'min-h-11 w-72 rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand sm:min-h-0';

export function CrewTypesAdmin() {
  const queryClient = useQueryClient();
  const crewTypesQuery = useQuery({ queryKey: crewTypesKey(), queryFn: getCrewTypes });
  const [types, setTypes] = useState<string[]>([]);
  // Hydrate once — a refetch-on-focus must not clobber in-progress edits (WS-L).
  const hydrated = useRef(false);

  // Hydrate the local draft once the config loads (and on refetch).
  useEffect(() => {
    if (crewTypesQuery.data && !hydrated.current) {
      setTypes(crewTypesQuery.data);
      hydrated.current = true;
    }
  }, [crewTypesQuery.data]);

  const save = useMutation({
    mutationFn: () => setCrewTypes(types.map((t) => t.trim()).filter(Boolean)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: crewTypesKey() }),
    onError: (err) => logger.error('Failed to save crew types', err),
  });

  // Editing after a save clears the stale "Saved." indicator.
  const editTypes = (updater: (prev: string[]) => string[]) => {
    save.reset();
    setTypes(updater);
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-brand">Crew types</h2>
      <p className="text-sm text-ink-muted">
        The crew types offered on labor crew lines in schedules and schedule templates (e.g. "(24)
        Stagehands · 10h").
      </p>
      <ul className="space-y-2">
        {types.map((type, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <input
              className={inputClass}
              value={type}
              aria-label={`Crew type ${i + 1}`}
              onChange={(e) =>
                editTypes((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))
              }
            />
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-xs text-ink-muted hover:text-accent sm:min-h-0"
              onClick={() => editTypes((prev) => prev.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded border border-line px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent sm:min-h-0"
          onClick={() => editTypes((prev) => [...prev, ''])}
        >
          + Add crew type
        </button>
        <button
          type="button"
          disabled={save.isPending || types.every((t) => !t.trim())}
          onClick={() => save.mutate()}
          className="inline-flex min-h-11 items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-0"
        >
          {save.isPending ? 'Saving…' : 'Save crew types'}
        </button>
        {save.isSuccess && <span className="text-sm text-status-complete">Saved.</span>}
        {save.isError && <span className="text-sm text-accent">Could not save.</span>}
      </div>
    </div>
  );
}
