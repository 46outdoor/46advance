import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { emptyLogo, logoPaths, type Logo } from '@/lib/branding/logo';
import { brandingKey, getBranding, setDefaultLogos } from '@/lib/branding/branding-service';
import { deleteStoredAssets } from '@/lib/storage/uploads';
import { LogoUploader } from '@/components/branding/LogoUploader';

const logger = createLogger('Branding');

const MAX_DEFAULT_LOGOS = 3;

/** Admin: app-wide default logo marks (`config/branding.defaultLogos`, e.g. 46 + Peachtree). */
export function BrandingAdmin() {
  const queryClient = useQueryClient();
  const brandingQuery = useQuery({ queryKey: brandingKey(), queryFn: getBranding });
  const [logos, setLogos] = useState<Logo[]>([]);
  // Hydrate the draft once, not on every refetch — a refetch-on-window-focus must not overwrite
  // in-progress edits (WS-L). The form is the source of truth until the user saves or reloads.
  const hydrated = useRef(false);

  // Hydrate local draft once branding loads (and on refetch).
  useEffect(() => {
    if (brandingQuery.data && !hydrated.current) {
      setLogos(brandingQuery.data.defaultLogos);
      hydrated.current = true;
    }
  }, [brandingQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const original = brandingQuery.data?.defaultLogos ?? [];
      await setDefaultLogos(logos);
      // After the draft is durably saved, delete objects the edit replaced/removed (F-5).
      const kept = new Set(logos.flatMap(logoPaths));
      await deleteStoredAssets(original.flatMap(logoPaths).filter((p) => !kept.has(p)));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brandingKey() }),
    onError: (err) => logger.error('Failed to save default logos', err),
  });

  const updateLogo = (index: number, logo: Logo) =>
    setLogos((prev) => prev.map((l, i) => (i === index ? logo : l)));

  const updateName = (index: number, name: string) =>
    setLogos((prev) =>
      prev.map((l, i) => (i === index ? { ...l, name: name.trim() ? name : null } : l)),
    );

  const removeLogo = (index: number) => setLogos((prev) => prev.filter((_, i) => i !== index));

  const addLogo = () => setLogos((prev) => [...prev, emptyLogo()]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-brand">Branding</h2>
      </div>
      <p className="text-sm text-ink-muted">
        Shared default marks (e.g. 46, Peachtree) auto-applied to every packet and header.
        Each logo has two variants so it renders on any background.
      </p>

      {brandingQuery.isLoading && <p className="text-sm text-ink-muted">Loading branding…</p>}
      {brandingQuery.isError && <p className="text-sm text-accent">Failed to load branding.</p>}

      {brandingQuery.data && (
        <>
          {logos.length === 0 && (
            <p className="text-sm text-ink-muted">No default logos yet. Add one to get started.</p>
          )}

          <ul className="space-y-4">
            {logos.map((logo, index) => (
              <li key={index} className="space-y-3 rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block font-semibold text-ink">Name (optional)</span>
                    <input
                      className="min-h-11 w-56 rounded border border-line px-3 py-2 outline-none focus:border-brand"
                      value={logo.name ?? ''}
                      onChange={(e) => updateName(index, e.target.value)}
                      placeholder="e.g. 46 Entertainment"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeLogo(index)}
                    className="min-h-11 rounded border border-line px-3 py-2 text-xs transition-colors hover:border-accent hover:text-accent"
                  >
                    Remove
                  </button>
                </div>
                <LogoUploader
                  logo={logo}
                  pathPrefix={`branding/${index}`}
                  onChange={(next) => updateLogo(index, next)}
                  disabled={save.isPending}
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={logos.length >= MAX_DEFAULT_LOGOS}
              onClick={addLogo}
              className="min-h-11 rounded border border-line px-3 py-2 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Add logo
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className="min-h-11 rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save default logos'}
            </button>
            {save.isError && <span className="text-sm text-accent">Failed to save.</span>}
            {save.isSuccess && <span className="text-sm text-status-complete">Saved.</span>}
          </div>
        </>
      )}
    </div>
  );
}
