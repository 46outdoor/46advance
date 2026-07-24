import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { describeCallableError } from '@/lib/errors/callableError';
import { artistsFromDocuments, filterArtists } from '@/lib/documents/artistDocument';
import { listArtistDocuments } from '@/lib/documents/artist-documents-service';
import { importDriveFolder } from '@/lib/google';

const logger = createLogger('Documents');

/** Top-level artist-documents library: artists list; managers import from Drive. */
export function DocumentsScreen() {
  const { isAdmin, isOrganizer } = useAuth();
  const canManage = isAdmin || isOrganizer;
  const queryClient = useQueryClient();
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchFiles, setSearchFiles] = useState(false);

  const documentsQuery = useQuery({ queryKey: ['artistDocuments'], queryFn: listArtistDocuments });

  // Syncs the admin-configured library root via the docs-broker service account — no folder pick
  // and no Drive scope from the caller (see functions/src/googleDrive.ts importDriveFolder).
  const importMutation = useMutation({
    mutationFn: () => importDriveFolder(),
    onSuccess: (result) => {
      setImportError(null);
      setImportMessage(`Imported ${result.imported}, skipped ${result.skipped}.`);
      void queryClient.invalidateQueries({ queryKey: ['artistDocuments'] });
    },
    onError: (err) => {
      logger.error('Failed to sync the Drive library', err);
      setImportMessage(null);
      setImportError(describeCallableError(err, 'Could not sync from Drive. Please try again.'));
    },
  });

  const onImport = () => {
    setImportMessage(null);
    setImportError(null);
    importMutation.mutate();
  };

  const documents = documentsQuery.data ?? [];
  const artists = artistsFromDocuments(documents);
  const filteredArtists = filterArtists(artists, documents, search, searchFiles);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black tracking-tight text-brand">Documents</h1>
          <p className="text-ink-muted">
            Artist documents imported from Google Drive, organized by artist.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            disabled={importMutation.isPending}
            onClick={onImport}
            title="Pull in any files added to the library folder in Drive since the last sync"
            className="min-h-[44px] rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {importMutation.isPending ? 'Syncing…' : 'Sync from Drive'}
          </button>
        )}
      </header>

      {importMessage && <p className="text-sm text-ink-muted">{importMessage}</p>}
      {importError && <p className="text-sm text-accent">{importError}</p>}

      {documents.length > 0 && (
        <div className="space-y-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search artists…"
            className="min-h-[44px] w-full rounded-lg border border-line bg-transparent px-4 py-2 text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={searchFiles}
              onChange={(e) => setSearchFiles(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Also search within file names (for misfiled documents)
          </label>
        </div>
      )}

      {documentsQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {documentsQuery.isError && <p className="text-sm text-accent">Failed to load documents.</p>}

      {!documentsQuery.isLoading && documents.length === 0 && (
        <p className="text-sm text-ink-muted">
          No documents yet.
          {canManage &&
            ' Set the library folder in Admin → Document library, then use “Sync from Drive”.'}
        </p>
      )}

      <div className="space-y-2">
        {filteredArtists.map((artist) => (
          <Link
            key={artist.key}
            to={`/documents/artists/${encodeURIComponent(artist.key)}`}
            className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 transition-colors hover:border-accent"
          >
            <span className="min-w-0 truncate font-semibold text-ink">{artist.name}</span>
            <span className="shrink-0 text-sm text-ink-muted">
              {artist.count} {artist.count === 1 ? 'document' : 'documents'}
              {artist.removedCount > 0 && (
                <span
                  className="ml-1 text-accent"
                  title="Files removed from Drive, kept for reference"
                >
                  · {artist.removedCount} removed
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>

      {documents.length > 0 && filteredArtists.length === 0 && (
        <p className="text-sm text-ink-muted">No artists match “{search.trim()}”.</p>
      )}
    </section>
  );
}
