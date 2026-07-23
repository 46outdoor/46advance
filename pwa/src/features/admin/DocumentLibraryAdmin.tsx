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
import { validateLibraryFolder } from '@/lib/google/drive-service';
import {
  documentsLibraryKey,
  getDocumentsLibraryRoot,
  setDocumentsLibraryRoot,
} from '@/lib/documents/documents-library-service';
import type { ValidateLibraryFolderReason } from '@contracts/callables/googleDrive';

const logger = createLogger('DocumentLibrary');

/** Friendly, actionable copy for each reason the folder validation can reject an id. */
const FOLDER_REASON_MESSAGE: Record<ValidateLibraryFolderReason, string> = {
  not_found: 'No Drive folder with that ID — check for a typo.',
  not_a_folder: 'That ID points to a file, not a folder.',
  trashed: 'That folder is in the Drive trash.',
  inaccessible: 'Can’t access that folder — share it with the docs-broker service account.',
};

export function DocumentLibraryAdmin() {
  const queryClient = useQueryClient();
  const rootQuery = useQuery({ queryKey: documentsLibraryKey(), queryFn: getDocumentsLibraryRoot });
  const [folderId, setFolderId] = useState('');

  // Hydrate the local draft once the config loads (and on refetch).
  useEffect(() => {
    if (rootQuery.data !== undefined) setFolderId(rootQuery.data);
  }, [rootQuery.data]);

  // Validate the id via the docs-broker SA BEFORE persisting: a bad/typo'd/unshared id would
  // otherwise silently break the twice-daily sync. On success the mutation resolves to the folder
  // name (shown in the confirmation); a rejection throws a friendly message rendered inline.
  const save = useMutation({
    mutationFn: async (): Promise<string> => {
      const id = folderId.trim();
      const result = await validateLibraryFolder(id);
      if (!result.ok) throw new Error(FOLDER_REASON_MESSAGE[result.reason]);
      await setDocumentsLibraryRoot(id);
      return result.name;
    },
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
        {save.isSuccess && (
          <span className="text-sm text-status-complete">Saved — mirroring “{save.data}”.</span>
        )}
        {save.isError && (
          <span className="text-sm text-accent">
            {save.error instanceof Error ? save.error.message : 'Could not save.'}
          </span>
        )}
      </div>
    </div>
  );
}
