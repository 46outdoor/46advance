/**
 * Artist documents on an advance (Documents PR 3). Lists the library's files for this
 * advance's artist (matched by the normalized name key) with include checkboxes for
 * advance editors; everyone views the included set and opens files in-app via the
 * docs-broker (no direct Drive permissions needed). Included docs whose library entry
 * was since deleted stay listed from the advance's own copy.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { artistKey, documentTitle, type ArtistDocument } from '@/lib/documents/artistDocument';
import { listDocumentsForArtist } from '@/lib/documents/artist-documents-service';
import { listDocumentCategories } from '@/lib/documents/document-categories-service';
import type { DocumentCategory } from '@/lib/documents/documentCategory';
import { openArtistDocument } from '@/lib/google/drive-service';
import {
  excludeArtistDocument,
  includeArtistDocument,
  listAdvanceDocuments,
} from './advance-documents-service';

const logger = createLogger('AdvanceDocuments');

interface Props {
  eventId: string;
  stageId: string;
  advanceId: string;
  artistName: string;
  canEdit: boolean;
}

function OpenButton({ fileId }: { fileId: string }) {
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center text-xs font-semibold text-ink-muted hover:text-accent sm:min-h-0"
      onClick={() => void openArtistDocument(fileId).catch((e) => logger.error('Failed to open document', e))}
    >
      Open
    </button>
  );
}

export function AdvanceDocumentsPanel({ eventId, stageId, advanceId, artistName, canEdit }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = artistKey(artistName);

  const libraryQuery = useQuery({
    queryKey: ['artistDocuments', 'byArtist', key],
    queryFn: () => listDocumentsForArtist(key),
  });
  const includedQuery = useQuery({
    queryKey: ['advanceDocuments', eventId, stageId, advanceId],
    queryFn: () => listAdvanceDocuments(eventId, stageId, advanceId),
  });
  const categoriesQuery = useQuery({ queryKey: ['documentCategories'], queryFn: listDocumentCategories });
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['advanceDocuments', eventId, stageId, advanceId] });

  const toggle = useMutation({
    // Exclusion needs only the id (orphaned rows have no library doc anymore).
    mutationFn: ({ include, doc, docId }: { include: boolean; doc?: ArtistDocument; docId: string }) =>
      include && doc
        ? includeArtistDocument(eventId, stageId, advanceId, doc, user!.uid)
        : excludeArtistDocument(eventId, stageId, advanceId, docId),
    onSuccess: invalidate,
    onError: (e) => logger.error('Failed to update included documents', e),
  });

  const library = libraryQuery.data ?? [];
  const included = includedQuery.data ?? [];
  const includedIds = new Set(included.map((d) => d.id));
  // Included docs whose library entry vanished — render from the advance's own copy.
  const orphaned = included.filter((d) => !library.some((l) => l.id === d.id));
  const categoryName = (id: string | null) =>
    (categoriesQuery.data ?? []).find((c: DocumentCategory) => c.id === id)?.name ?? null;

  if (!canEdit && included.length === 0) return null;

  return (
    <div className="rounded-lg border border-line p-4">
      <h2 className="mb-1 font-display text-lg font-bold text-brand">Documents</h2>
      <p className="mb-3 text-xs text-ink-muted">
        {canEdit
          ? `Library files for ${artistName} — check the ones that belong on this advance. Files open in-app for every member.`
          : 'Documents included on this advance. Files open in-app.'}
      </p>

      {libraryQuery.isLoading && <p className="text-sm text-ink-muted">Loading documents…</p>}
      {libraryQuery.isError && <p className="text-sm text-accent">Failed to load the document library.</p>}
      {canEdit && !libraryQuery.isLoading && library.length === 0 && (
        <p className="text-sm text-ink-muted">
          No library documents for “{artistName}” — import them under Documents first.
        </p>
      )}

      <ul className="divide-y divide-line/60">
        {(canEdit ? library : library.filter((d) => includedIds.has(d.id))).map((doc) => (
          <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            {canEdit && (
              <label className="inline-flex min-h-11 min-w-11 items-center justify-center sm:min-h-0 sm:min-w-0">
                <input
                  type="checkbox"
                  checked={includedIds.has(doc.id)}
                  disabled={toggle.isPending}
                  aria-label={`Include ${documentTitle(doc)}`}
                  onChange={(e) => toggle.mutate({ include: e.target.checked, doc, docId: doc.id })}
                />
              </label>
            )}
            <span className="font-semibold text-ink">{documentTitle(doc)}</span>
            {categoryName(doc.categoryId) && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-muted">
                {categoryName(doc.categoryId)}
              </span>
            )}
            {doc.obsolete && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-accent">
                Obsolete
              </span>
            )}
            <OpenButton fileId={doc.fileId} />
          </li>
        ))}
        {orphaned.map((doc) => (
          <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            {canEdit && (
              <label className="inline-flex min-h-11 min-w-11 items-center justify-center sm:min-h-0 sm:min-w-0">
                <input
                  type="checkbox"
                  checked
                  disabled={toggle.isPending}
                  aria-label={`Remove ${doc.displayName ?? doc.name}`}
                  onChange={() => toggle.mutate({ include: false, docId: doc.id })}
                />
              </label>
            )}
            <span className="font-semibold text-ink">{doc.displayName ?? doc.name}</span>
            <span className="text-[0.65rem] text-ink-muted">(removed from library)</span>
            <OpenButton fileId={doc.fileId} />
          </li>
        ))}
      </ul>
      {toggle.isError && <p className="mt-1 text-sm text-accent">Could not update — try again.</p>}
    </div>
  );
}
