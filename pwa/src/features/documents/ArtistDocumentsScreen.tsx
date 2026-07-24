import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { useBeforeUnload } from '@/lib/hooks/useBeforeUnload';
import { FilePickerButton } from '@/components/FilePickerButton';
import {
  createArtistDocumentRecord,
  deleteArtistDocument,
  getDocumentsLibraryRoot,
  listDocumentsForArtist,
  setArtistDocumentCategory,
  setArtistDocumentVerified,
  updateArtistDocument,
} from '@/lib/documents/artist-documents-service';
import {
  documentTitle,
  isVerifiedCurrent,
  type ArtistDocument,
} from '@/lib/documents/artistDocument';
import { listDocumentCategories } from '@/lib/documents/document-categories-service';
import type { DocumentCategory } from '@/lib/documents/documentCategory';
import {
  createDriveFolder,
  deleteDriveUpload,
  openArtistDocument,
  uploadFileToDrive,
} from '@/lib/google/drive-service';

const logger = createLogger('Documents');

const inputClass =
  'w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand';
const chipButton =
  'min-h-[44px] rounded border border-line px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50';

interface RowProps {
  doc: ArtistDocument;
  categories: DocumentCategory[];
  canManage: boolean;
  pending: boolean;
  onSetCategory: (categoryId: string | null) => void;
  onUpdate: (fields: {
    displayName?: string | null;
    notes?: string | null;
    obsolete?: boolean;
  }) => void;
  onSetVerified: (verified: boolean) => void;
  onRemove: () => void;
}

/** One document row: in-app title (overrides the Drive name), category, notes, obsolete tag. */
function DocumentRow({
  doc,
  categories,
  canManage,
  pending,
  onSetCategory,
  onUpdate,
  onSetVerified,
  onRemove,
}: RowProps) {
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
    <article
      className={`rounded-lg border px-4 py-3 ${doc.obsolete ? 'border-line/60 bg-surface-muted/30' : 'border-line'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={view}
            disabled={viewing}
            title="Open in-app (no Drive access needed)"
            className={`min-w-0 truncate text-left font-semibold transition-colors hover:text-accent disabled:opacity-60 ${doc.obsolete ? 'text-ink-muted line-through' : 'text-ink'}`}
          >
            {documentTitle(doc)}
          </button>
          {viewing && <span className="shrink-0 text-xs text-ink-muted">opening…</span>}
          {viewError && <span className="shrink-0 text-xs text-accent">Couldn't open</span>}
          {doc.obsolete && (
            <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-accent">
              Obsolete
            </span>
          )}
          {doc.missingFromDrive && (
            <span
              title="The Drive file was deleted or moved out of the library folder"
              className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-accent"
            >
              Removed from Drive{doc.missingAt ? ` · ${doc.missingAt.toLocaleDateString()}` : ''}
            </span>
          )}
          <span
            className={`shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide ${verified ? 'text-status-complete' : 'text-ink-muted'}`}
          >
            {verified ? 'Verified' : 'Unverified'}
          </span>
          <a
            href={doc.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Drive (needs Drive access)"
            className="shrink-0 text-xs text-ink-muted transition-colors hover:text-accent"
          >
            Drive ↗
          </a>
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
            <button
              type="button"
              disabled={pending}
              onClick={() => onSetVerified(!verified)}
              className={chipButton}
            >
              {verified ? 'Unverify' : 'Verify current'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onUpdate({ obsolete: !doc.obsolete })}
              className={chipButton}
            >
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
            <span className="mb-1 block text-ink-muted">
              In-app title (blank = Drive name “{doc.name}”)
            </span>
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={doc.name}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">Notes</span>
            <textarea
              className={inputClass}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
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
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!editing && doc.notes && (
        <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{doc.notes}</p>
      )}
    </article>
  );
}

/** Upload a new file into this artist's Drive subfolder (managers). The target is the
 * `sourceFolderId` recorded on the artist's docs; docs imported before folder tracking
 * need one re-import first (creating a same-named duplicate folder would be worse). A
 * brand-new artist (no docs) gets a subfolder created under the library root. */
function ArtistUploadPanel({
  artistName,
  documents,
  onUploaded,
}: {
  artistName: string;
  documents: readonly ArtistDocument[];
  onUploaded: () => void;
}) {
  const [inputKey, setInputKey] = useState(0);
  const targetFolderId = documents.find((d) => d.sourceFolderId)?.sourceFolderId ?? null;
  const needsReimport = !targetFolderId && documents.length > 0;

  const upload = useMutation({
    mutationFn: async (file: File) => {
      let folderId = targetFolderId;
      if (!folderId) {
        const root = await getDocumentsLibraryRoot();
        if (!root)
          throw new Error('Import the library first — its root folder isn’t recorded yet.');
        folderId = await createDriveFolder(artistName, root);
      }
      const uploaded = await uploadFileToDrive(file, folderId);
      try {
        await createArtistDocumentRecord(uploaded.fileId);
      } catch (e) {
        // Compensate: remove the just-created Drive file so it isn't left without a record.
        // If the cleanup itself fails, log it — a silent swallow would hide the orphan. (The
        // twice-daily library sync also re-adopts any unrecorded library file as a backstop.)
        await deleteDriveUpload(uploaded.fileId).catch((cleanupErr) =>
          logger.error(
            'Failed to remove an orphaned Drive upload after a failed record write',
            cleanupErr,
          ),
        );
        throw e;
      }
    },
    onSuccess: onUploaded,
    onError: (e) => logger.error('Failed to upload the document', e),
  });
  // Discourage a hard tab-close mid-upload, which would abandon the record write and orphan the file.
  useBeforeUnload(upload.isPending);

  if (needsReimport) {
    return (
      <p className="text-sm text-ink-muted">
        To upload here, re-run the library import once (Documents → Import) — it records each
        artist's Drive folder.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
      <span className="text-sm font-semibold text-ink">Upload to {artistName}'s folder</span>
      <FilePickerButton
        key={inputKey}
        label="Choose file"
        ariaLabel="File to upload"
        disabled={upload.isPending}
        onFile={(file) => {
          upload.mutate(file);
          setInputKey((k) => k + 1);
        }}
      />
      {upload.isPending && <span className="text-sm text-ink-muted">Uploading…</span>}
      {upload.isError && (
        <span className="text-sm text-accent">
          {upload.error instanceof Error ? upload.error.message : 'Upload failed.'}
        </span>
      )}
    </div>
  );
}

/** One artist's documents: links out to Drive; managers classify, retitle (in-app), note, flag obsolete. */
export function ArtistDocumentsScreen() {
  const { user, isAdmin, isOrganizer } = useAuth();
  const canManage = isAdmin || isOrganizer;
  const { artistKey } = useParams();
  const decodedKey = decodeURIComponent(artistKey ?? '');
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ['artistDocuments', 'artist', decodedKey],
    queryFn: () => listDocumentsForArtist(decodedKey),
  });
  const categoriesQuery = useQuery({
    queryKey: ['documentCategories'],
    queryFn: listDocumentCategories,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['artistDocuments', 'artist', decodedKey] });

  const setCategory = useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) =>
      setArtistDocumentCategory(id, categoryId),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to set document category', err),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      fields,
    }: {
      id: string;
      fields: { displayName?: string | null; notes?: string | null; obsolete?: boolean };
    }) => updateArtistDocument(id, fields),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to update document', err),
  });

  const setVerified = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      setArtistDocumentVerified(id, verified),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to set verification', err),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteArtistDocument(id),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to remove document', err),
  });

  const documents = documentsQuery.data ?? [];
  const presentDocs = documents.filter((d) => !d.missingFromDrive);
  const removedDocs = documents.filter((d) => d.missingFromDrive);
  const categories = categoriesQuery.data ?? [];
  const artistName = documents[0]?.artist ?? decodedKey;

  const renderRow = (doc: ArtistDocument) => (
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
  );

  return (
    <section className="space-y-6">
      <div>
        <Link
          to="/documents"
          className="text-sm text-ink-muted transition-colors hover:text-accent"
        >
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

      {canManage && user && documentsQuery.data && (
        <ArtistUploadPanel
          artistName={artistName}
          documents={documents}
          onUploaded={() => void invalidate()}
        />
      )}

      <div className="space-y-2">{presentDocs.map(renderRow)}</div>

      {removedDocs.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-display text-lg font-bold text-ink-muted">
            Removed from Drive ({removedDocs.length})
          </h2>
          <p className="text-sm text-ink-muted">
            These files were deleted or moved out of the library folder in Google Drive. They're
            kept here so a search still turns them up and you can see they once existed (and when
            they went).
          </p>
          {removedDocs.map(renderRow)}
        </div>
      )}
    </section>
  );
}
