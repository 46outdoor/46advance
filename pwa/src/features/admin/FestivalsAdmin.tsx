import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { emptyLogo, type Logo } from '@/lib/branding/logo';
import { LogoUploader } from '@/components/branding/LogoUploader';
import { festivalInputSchema } from '@/lib/festivals/festival';
import {
  createFestival,
  deleteFestival,
  festivalsKey,
  listFestivals,
  setFestivalLogo,
  updateFestival,
} from '@/lib/festivals/festivals-service';

const logger = createLogger('Festivals');

/**
 * Admin: the app-wide festival list. Each festival carries a name + logo; events pick a festival,
 * inheriting its name (into the composed event name) and its logo (auto-applied, overridable per
 * event). Departments-style CRUD plus a per-festival dual-variant logo.
 */
export function FestivalsAdmin() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const festivalsQuery = useQuery({ queryKey: festivalsKey(), queryFn: listFestivals });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: festivalsKey() });
  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const create = useMutation({
    mutationFn: () =>
      createFestival(festivalInputSchema.parse({ name }), festivalsQuery.data?.length ?? 0),
    onSuccess: () => {
      void invalidate();
      setName('');
    },
    onError: (err) => logger.error('Failed to create festival', err),
  });

  const rename = useMutation({
    mutationFn: (id: string) => updateFestival(id, festivalInputSchema.parse({ name: editName })),
    onSuccess: () => {
      void invalidate();
      cancelEdit();
    },
    onError: (err) => logger.error('Failed to rename festival', err),
  });

  const saveLogo = useMutation({
    mutationFn: ({ id, logo }: { id: string; logo: Logo }) => setFestivalLogo(id, logo),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to save festival logo', err),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFestival(id),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to delete festival', err),
  });

  const festivals = festivalsQuery.data ?? [];

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold text-brand">Festivals</h2>
      <p className="text-sm text-ink-muted">
        Each festival is set up once with its logo. On an event you pick the festival — its name
        feeds the event name, and its logo auto-applies alongside the company defaults (overridable
        per event).
      </p>

      {festivalsQuery.isLoading && <p className="text-sm text-ink-muted">Loading festivals…</p>}
      {festivalsQuery.isError && <p className="text-sm text-accent">Failed to load festivals.</p>}

      {festivals.length > 0 && (
        <ul className="space-y-3">
          {festivals.map((f) => {
            const isEditing = editingId === f.id;
            return (
              <li key={f.id} className="space-y-2 rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {isEditing ? (
                    <form
                      className="flex flex-1 flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editName.trim()) rename.mutate(f.id);
                      }}
                    >
                      <input
                        autoFocus
                        aria-label="Rename festival"
                        className="min-h-11 w-64 rounded border border-line px-3 py-2 outline-none focus:border-brand"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                      <button
                        type="submit"
                        disabled={rename.isPending || !editName.trim()}
                        className="min-h-11 rounded border border-line px-3 py-2 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                      >
                        {rename.isPending ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="min-h-11 rounded border border-line px-3 py-2 text-xs transition-colors hover:border-accent hover:text-accent"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="font-semibold text-ink">{f.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(f.id);
                            setEditName(f.name);
                          }}
                          className="min-h-11 rounded border border-line px-2 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(f.id)}
                          className="min-h-11 rounded border border-line px-2 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <LogoUploader
                  logo={f.logo ?? emptyLogo()}
                  pathPrefix={`festivals/${f.id}/logo`}
                  onChange={(next) => saveLogo.mutateAsync({ id: f.id, logo: next })}
                  disabled={saveLogo.isPending}
                />
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Add festival</span>
          <input
            className="min-h-11 w-64 rounded border border-line px-3 py-2 outline-none focus:border-brand"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rock the Country"
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="min-h-11 rounded border border-line px-3 py-2 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
