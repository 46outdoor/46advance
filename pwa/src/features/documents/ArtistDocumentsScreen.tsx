import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import {
  deleteArtistDocument,
  listDocumentsForArtist,
  setArtistDocumentCategory,
  setArtistDocumentVerified,
  updateArtistDocument,
} from '@/lib/documents/artist-documents-service';
import { documentTitle, isVerifiedCurrent, type ArtistDocument } from '@/lib/documents/artistDocument';
import { listDocumentCategories } from '@/lib/documents/document-categories-service';
import type { DocumentCategory } from '@/lib/documents/documentCategory';
import { openArtistDocument } from '@/lib/google/drive-service';

const logger = createLogger('Documents');

const inputClass = 'w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand';
const chipButton =
  'min-h-[44px] rounded border border-line px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50';

interface RowProps {
  doc: ArtistDocument;
  categories: DocumentCategory[];
  canManage: boolean;
  pending: boolean;
  onSetCategory: (categoryId: string | null) => void;
  onUpdate: (fields: { displayName?: string | null; notes?: string | null; obsolete?: boolean }) => void;
  onSetVerified: (verified: boolean) => void;
  onRemove: () => void;
}

/** One document row: in-app title (overrides the Drive name), category, notes, obsolete tag. */
function DocumentRow({ doc, categories, canManage, pending, onSetCategory, onUpdate, onSetVerified, onRemove }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(doc.displayName ?? '');
  const [notes, setNotes] = useState(doc.notes ?? '');
  const [viewing, setViewing] = useState(false);
  const [viewError, setViewError] = useState(false);

  const view = async () => {
    setViewError(false);
    setViewing(true);
    try {
      await openArtistDocument(doc.fileId);
    } catch {
      setViewError(true);
    } finally {
      setViewing(false);
    }
  };
  const categoryName = categories.find((c) => c.id === doc.categoryId)?.name ?? 'Unclassified';
  const verified = isVerifiedCurrent(doc.verifiedAt, new Date());

  const save = () => {
    onUpdate({ displayName: title.trim() || null, notes: notes.trim() || null });
    setEditing(false);
  };

  return (
    <article className={`rounded-lg border px-4 py-3 ${doc.obsolete ? 'border-line/60 bg-surface-muted/30' : 'border-line'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <a
            href={doc.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`min-w-0 truncate font-semibold transition-colors hover:text-accent ${doc.obsolete ? 'text-ink-muted line-through' : 'text-ink'}`}
          >
            {documentTitle(doc)}
          </a>
          {doc.obsolete && (
            <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-accent">
              Obsolete
            </span>
          )}
          <span
            className={`shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide ${verified ? 'text-status-complete' : 'text-ink-muted'}`}
          >
            {verified ? 'Verified' : 'Unverified'}
          </span>
          <button
            type="button"
            disabled={viewing}
            onClick={view}
            title="View in-app (no Drive access needed)"
            className="shrink-0 rounded border border-line px-2 py-0.5 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {viewing ? 'Opening…' : 'View'}
          </button>
          {viewError && <span className="shrink-0 text-xs text-accent">Couldn't open</span>}
        </div>
        {canManage ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <select
              value={doc.categoryId ?? ''}
              onChange={(e) => onSetCategory(e.target.value || null)}
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
            <button type="button" onClick={() => setEditing((v) => !v)} className={chipButton}>
              Edit
            </button>
            <button type="button" disabled={pending} onClick={() => onSetVerified(!verified)} className={chipButton}>
              {verified ? 'Unverify' : 'Verify current'}
            </button>
            <button type="button" disabled={pending} onClick={() => onUpdate({ obsolete: !doc.obsolete })} className={chipButton}>
              {doc.obsolete ? 'Mark current' : 'Mark obsolete'}
            </button>
            <button type="button" disabled={pending} onClick={onRemove} className={chipButton}>
              Remove
            </button>
          </div>
        ) : (
          <span className="shrink-0 text-sm text-ink-muted">{categoryName}</span>
        )}
      </div>

      {doc.verifiedAt && (
        <p className="mt-1 text-xs text-ink-muted">
          {verified ? 'Verified' : 'Last verified'} {doc.verifiedAt.toLocaleDateString()}
        </p>
      )}

      {editing && canManage && (
        <div className="mt-3 space-y-2">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">In-app title (blank = Drive name “{doc.name}”)</span>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={doc.name} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">Notes</span>
            <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-ink-muted hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}

      {!editing && doc.notes && <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{doc.notes}</p>}
    </article>
  );
}

/** One artist's documents: links out to Drive; managers classify, retitle (in-app), note, flag obsolete. */
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['artistDocuments', 'artist', decodedKey] });

  const setCategory = useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) =>
      setArtistDocumentCategory(id, categoryId),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to set document category', err),
  });

  const update = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: { displayName?: string | null; notes?: string | null; obsolete?: boolean } }) =>
      updateArtistDocument(id, fields),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to update document', err),
  });

  const setVerified = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) => setArtistDocumentVerified(id, verified),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to set verification', err),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteArtistDocument(id),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to remove document', err),
  });

  const documents = documentsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const artistName = documents[0]?.artist ?? decodedKey;

  return (
    <section className="space-y-6">
      <div>
        <Link to="/documents" className="text-sm text-ink-muted transition-colors hover:text-accent">
          ← Documents
        </Link>
      </div>

      <header>
        <h1 className="font-display text-3xl font-black tracking-tight text-brand">{artistName}</h1>
        <p className="text-ink-muted">Documents for this artist.</p>
      </header>

      {documentsQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {documentsQuery.isError && <p className="text-sm text-accent">Failed to load documents.</p>}
      {!documentsQuery.isLoading && documents.length === 0 && (
        <p className="text-sm text-ink-muted">No documents for this artist.</p>
      )}

      <div className="space-y-2">
        {documents.map((doc) => (
          <DocumentRow
            key={doc.id}
            doc={doc}
            categories={categories}
            canManage={canManage}
            pending={update.isPending || remove.isPending || setVerified.isPending}
            onSetCategory={(categoryId) => setCategory.mutate({ id: doc.id, categoryId })}
            onUpdate={(fields) => update.mutate({ id: doc.id, fields })}
            onSetVerified={(verified) => setVerified.mutate({ id: doc.id, verified })}
            onRemove={() => remove.mutate(doc.id)}
          />
        ))}
      </div>
    </section>
  );
}
