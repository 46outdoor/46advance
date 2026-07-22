/**
 * Admin: the Google Drive folder the artist-document library mirrors
 * (`config/documentsLibrary.rootFolderId`). Set deliberately here — "Import from Drive" pulls
 * files in but no longer repoints this. The folder must be shared with the docs-broker service
 * account so the twice-daily sync can read it. Follows the CrewTypesAdmin pattern: local draft,
 * explicit save.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import {
  documentsLibraryKey,
  getDocumentsLibraryRoot,
  setDocumentsLibraryRoot,
} from '@/lib/documents/documents-library-service';

const logger = createLogger('DocumentLibrary');

export function DocumentLibraryAdmin() {
  const queryClient = useQueryClient();
  const rootQuery = useQuery({ queryKey: documentsLibraryKey(), queryFn: getDocumentsLibraryRoot });
  const [folderId, setFolderId] = useState('');

  // Hydrate the local draft once the config loads (and on refetch).
  useEffect(() => {
    if (rootQuery.data !== undefined) setFolderId(rootQuery.data);
  }, [rootQuery.data]);

  const save = useMutation({
    mutationFn: () => setDocumentsLibraryRoot(folderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentsLibraryKey() }),
    onError: (err) => logger.error('Failed to save library folder', err),
  });

  const dirty = folderId.trim() !== (rootQuery.data ?? '');

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-brand">Document library</h2>
      <p className="text-sm text-ink-muted">
        The Google Drive folder the artist-document library mirrors — its immediate subfolders are
        artists, and the twice-daily sync keeps the library in step. The folder must be shared with
        the docs-broker service account. “Import from Drive” pulls files in but never changes this.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Root folder ID</span>
        <input
          className="min-h-11 w-full max-w-xl rounded border border-line bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus:border-brand sm:min-h-0"
          value={folderId}
          placeholder="Google Drive folder ID"
          onChange={(e) => {
            save.reset();
            setFolderId(e.target.value);
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={save.isPending || !dirty || !folderId.trim()}
          onClick={() => save.mutate()}
          className="inline-flex min-h-11 items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-0"
        >
          {save.isPending ? 'Saving…' : 'Save folder'}
        </button>
        {save.isSuccess && <span className="text-sm text-status-complete">Saved.</span>}
        {save.isError && <span className="text-sm text-accent">Could not save.</span>}
      </div>
    </div>
  );
}
