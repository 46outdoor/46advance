import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import {
  formatMoney,
  isValidQuoteTransition,
  lineItemTotal,
  quoteTotal,
  type Quote,
  type QuoteInput,
  type QuoteStatus,
} from '@/lib/quotes/quote';
import { validateUpload } from '@/lib/storage/uploads';
import {
  attachSignedCopy,
  deleteQuote,
  generateQuotePdf,
  getFileUrl,
  removeSignedCopy,
  setQuoteStatus,
  updateQuote,
} from './quotes-service';
import { QuoteForm } from './QuoteForm';
import { QuoteStatusBadge } from './QuoteStatusBadge';

const logger = createLogger('Quotes');
const btn = 'rounded border border-line px-2.5 py-1 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50';

interface QuoteCardProps {
  eventId: string;
  stageId: string;
  advanceId: string;
  uid: string;
  canEdit: boolean;
  quote: Quote;
}

export function QuoteCard({ eventId, stageId, advanceId, uid, canEdit, quote }: QuoteCardProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['quotes', eventId, stageId, advanceId] });

  const update = useMutation({
    mutationFn: (input: QuoteInput) => updateQuote(eventId, stageId, advanceId, quote.id, input),
    onSuccess: () => {
      void invalidate();
      setEditing(false);
    },
    onError: (err) => logger.error('Failed to update quote', err),
  });

  const status = useMutation({
    mutationFn: ({ to, note }: { to: QuoteStatus; note?: string }) =>
      setQuoteStatus(eventId, stageId, advanceId, quote.id, to, uid, note),
    onSuccess: () => {
      void invalidate();
      setRejecting(false);
      setRejectNote('');
    },
    onError: (err) => logger.error('Failed to change quote status', err),
  });

  const remove = useMutation({
    mutationFn: () => deleteQuote(eventId, stageId, advanceId, quote.id),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to delete quote', err),
  });

  const pdf = useMutation({
    mutationFn: () => generateQuotePdf(eventId, stageId, advanceId, quote.id),
    onSuccess: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
    onError: (err) => logger.error('Failed to generate quote PDF', err),
  });

  const upload = useMutation({
    mutationFn: (file: File) => attachSignedCopy(eventId, stageId, advanceId, quote.id, file, quote.signedCopyPath),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to upload signed copy', err),
  });

  const unattach = useMutation({
    mutationFn: () => removeSignedCopy(eventId, stageId, advanceId, quote.id, quote.signedCopyPath!),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to remove signed copy', err),
  });

  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    const err = validateUpload(file);
    if (err) {
      setUploadError(err);
      return;
    }
    setUploadError(null);
    upload.mutate(file);
  };

  const openSignedCopy = async () => {
    if (!quote.signedCopyPath) return;
    try {
      window.open(await getFileUrl(quote.signedCopyPath), '_blank', 'noopener,noreferrer');
    } catch (err) {
      logger.error('Failed to open signed copy', err);
    }
  };

  const total = quoteTotal(quote.lineItems);
  const can = (to: QuoteStatus) => isValidQuoteTransition(quote.status, to);

  if (editing) {
    return (
      <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
        <h3 className="mb-3 font-semibold text-brand">Edit quote</h3>
        <QuoteForm
          initial={quote}
          submitLabel="Save changes"
          pending={update.isPending}
          error={update.isError ? 'Could not save changes.' : null}
          onSubmit={(input) => update.mutate(input)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-ink">{quote.title}</h3>
          <QuoteStatusBadge status={quote.status} />
        </div>
        <span className="font-semibold text-brand">{formatMoney(total)}</span>
      </div>

      <ul className="mt-2 space-y-0.5 text-sm text-ink-muted">
        {quote.lineItems.map((item, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span>
              {item.description} <span className="text-ink-muted/70">· {item.quantity} × {formatMoney(item.unitPrice)}</span>
            </span>
            <span>{formatMoney(lineItemTotal(item))}</span>
          </li>
        ))}
      </ul>

      {quote.notes && <p className="mt-2 whitespace-pre-line text-sm text-ink">{quote.notes}</p>}
      {quote.decisionNote && (
        <p className="mt-2 text-sm text-ink-muted">
          <span className="font-semibold">Decision note:</span> {quote.decisionNote}
        </p>
      )}

      {/* Signed copy */}
      <div className="mt-3 text-sm">
        {quote.signedCopyPath ? (
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void openSignedCopy()} className="text-accent hover:underline">
              View signed copy
            </button>
            {canEdit && (
              <button type="button" onClick={() => unattach.mutate()} disabled={unattach.isPending} className="text-ink-muted hover:text-accent disabled:opacity-50">
                Remove
              </button>
            )}
          </div>
        ) : (
          canEdit && <span className="text-ink-muted">No signed copy uploaded.</span>
        )}
        {uploadError && <p className="mt-1 text-accent">{uploadError}</p>}
      </div>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {can('sent') && quote.status === 'draft' && (
            <button type="button" className={btn} disabled={status.isPending} onClick={() => status.mutate({ to: 'sent' })}>
              Mark as sent
            </button>
          )}
          {quote.status === 'sent' && (
            <>
              <button type="button" className={btn} disabled={status.isPending} onClick={() => status.mutate({ to: 'approved' })}>
                Approve
              </button>
              <button type="button" className={btn} disabled={status.isPending} onClick={() => setRejecting((v) => !v)}>
                Reject
              </button>
              <button type="button" className={btn} disabled={status.isPending} onClick={() => status.mutate({ to: 'draft' })}>
                Back to draft
              </button>
            </>
          )}
          {(quote.status === 'approved' || quote.status === 'rejected') && (
            <button type="button" className={btn} disabled={status.isPending} onClick={() => status.mutate({ to: 'sent' })}>
              Reopen
            </button>
          )}

          <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />

          <button type="button" className={btn} disabled={pdf.isPending} onClick={() => pdf.mutate()}>
            {pdf.isPending ? 'Generating…' : 'Generate PDF'}
          </button>
          <button type="button" className={btn} onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? 'Uploading…' : quote.signedCopyPath ? 'Replace signed copy' : 'Upload signed copy'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />
          <button type="button" className={btn} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className={btn}
            disabled={remove.isPending}
            onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
          >
            {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}

      {rejecting && (
        <div className="mt-3 space-y-2 rounded border border-line bg-surface-muted/40 p-3">
          <textarea
            className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand"
            rows={2}
            placeholder="Reason (optional)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              disabled={status.isPending}
              onClick={() => status.mutate({ to: 'rejected', note: rejectNote })}
            >
              Confirm reject
            </button>
            <button type="button" className="text-xs text-ink-muted hover:text-ink" onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
