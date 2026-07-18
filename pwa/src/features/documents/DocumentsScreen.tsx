import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { artistsFromDocuments } from '@/lib/documents/artistDocument';
import { listArtistDocuments } from '@/lib/documents/artist-documents-service';
import { importDriveFolder, pickDriveFolder } from '@/lib/google';

const logger = createLogger('Documents');

/** Top-level artist-documents library: artists list; managers import from Drive. */
export function DocumentsScreen() {
  const { isAdmin, isOrganizer } = useAuth();
  const canManage = isAdmin || isOrganizer;
  const queryClient = useQueryClient();
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const documentsQuery = useQuery({ queryKey: ['artistDocuments'], queryFn: listArtistDocuments });

  const importMutation = useMutation({
    mutationFn: (folderId: string) => importDriveFolder(folderId),
    onSuccess: (result) => {
      setImportError(null);
      setImportMessage(`Imported ${result.imported}, skipped ${result.skipped}.`);
      void queryClient.invalidateQueries({ queryKey: ['artistDocuments'] });
    },
    onError: (err) => {
      logger.error('Failed to import Drive folder', err);
      setImportMessage(null);
      setImportError('Could not import. Connect Google Drive in Settings first.');
    },
  });

  const onImport = async () => {
    setImportMessage(null);
    setImportError(null);
    try {
      const folder = await pickDriveFolder();
      if (folder) importMutation.mutate(folder.id);
    } catch (err) {
      logger.error('Failed to open the Drive folder picker', err);
      setImportError('Could not open the Drive picker. Connect Google Drive in Settings first.');
    }
  };

  const documents = documentsQuery.data ?? [];
  const artists = artistsFromDocuments(documents);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black tracking-tight text-brand">Documents</h1>
          <p className="text-ink-muted">Artist documents imported from Google Drive, organized by artist.</p>
        </div>
        {canManage && (
          <button
            type="button"
            disabled={importMutation.isPending}
            onClick={() => void onImport()}
            className="min-h-[44px] rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {importMutation.isPending ? 'Importing…' : 'Import from Drive'}
          </button>
        )}
      </header>

      {importMessage && <p className="text-sm text-ink-muted">{importMessage}</p>}
      {importError && <p className="text-sm text-accent">{importError}</p>}

      {documentsQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {documentsQuery.isError && <p className="text-sm text-accent">Failed to load documents.</p>}

      {!documentsQuery.isLoading && documents.length === 0 && (
        <p className="text-sm text-ink-muted">
          No documents yet.
          {canManage && ' Use “Import from Drive” to bring in an artist-documents folder.'}
        </p>
      )}

      <div className="space-y-2">
        {artists.map((artist) => (
          <Link
            key={artist.key}
            to={`/documents/artists/${encodeURIComponent(artist.key)}`}
            className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 transition-colors hover:border-accent"
          >
            <span className="min-w-0 truncate font-semibold text-ink">{artist.name}</span>
            <span className="shrink-0 text-sm text-ink-muted">
              {artist.count} {artist.count === 1 ? 'document' : 'documents'}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
