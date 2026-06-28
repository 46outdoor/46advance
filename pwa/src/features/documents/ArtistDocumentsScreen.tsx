import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import {
  deleteArtistDocument,
  listDocumentsForArtist,
  setArtistDocumentCategory,
} from '@/lib/documents/artist-documents-service';
import { listDocumentCategories } from '@/lib/documents/document-categories-service';

const logger = createLogger('Documents');

/** One artist's documents: links out to Drive; managers classify + remove. */
export function ArtistDocumentsScreen() {
  const { isAdmin, isOrganizer } = useAuth();
  const canManage = isAdmin || isOrganizer;
  const { artistKey } = useParams();
  const decodedKey = decodeURIComponent(artistKey ?? '');
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ['artistDocuments', 'artist', decodedKey],
    queryFn: () => listDocumentsForArtist(decodedKey),
  });
  const categoriesQuery = useQuery({ queryKey: ['documentCategories'], queryFn: listDocumentCategories });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['artistDocuments', 'artist', decodedKey] });

  const setCategory = useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) =>
      setArtistDocumentCategory(id, categoryId),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to set document category', err),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteArtistDocument(id),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to remove document', err),
  });

  const documents = documentsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const displayName = documents[0]?.artist ?? decodedKey;
  const categoryName = (categoryId: string | null) =>
    categories.find((c) => c.id === categoryId)?.name ?? 'Unclassified';

  return (
    <section className="space-y-6">
      <div>
        <Link to="/documents" className="text-sm text-ink-muted transition-colors hover:text-accent">
          ← Documents
        </Link>
      </div>

      <header>
        <h1 className="font-display text-3xl font-black tracking-tight text-brand">{displayName}</h1>
        <p className="text-ink-muted">Documents for this artist.</p>
      </header>

      {documentsQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {documentsQuery.isError && <p className="text-sm text-accent">Failed to load documents.</p>}
      {!documentsQuery.isLoading && documents.length === 0 && (
        <p className="text-sm text-ink-muted">No documents for this artist.</p>
      )}

      <div className="space-y-2">
        {documents.map((doc) => (
          <article
            key={doc.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3"
          >
            <a
              href={doc.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate font-semibold text-ink transition-colors hover:text-accent"
            >
              {doc.name}
            </a>
            {canManage ? (
              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={doc.categoryId ?? ''}
                  onChange={(e) => setCategory.mutate({ id: doc.id, categoryId: e.target.value || null })}
                  className="min-h-[44px] rounded border border-line bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-brand"
                  aria-label="Category"
                >
                  <option value="">Unclassified</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(doc.id)}
                  className="min-h-[44px] rounded border border-line px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ) : (
              <span className="shrink-0 text-sm text-ink-muted">{categoryName(doc.categoryId)}</span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
