import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import type { QuoteInput } from '@/lib/quotes/quote';
import { createQuote, listQuotes } from './quotes-service';
import { QuoteCard } from './QuoteCard';
import { QuoteForm } from './QuoteForm';

const logger = createLogger('Quotes');

interface QuotesPanelProps {
  eventId: string;
  stageId: string;
  advanceId: string;
  uid: string;
  canEdit: boolean;
}

/** Quotes for an advance: list + create (PM/admin), each card carrying its own actions. */
export function QuotesPanel({ eventId, stageId, advanceId, uid, canEdit }: QuotesPanelProps) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const quotesQuery = useQuery({
    queryKey: ['quotes', eventId, stageId, advanceId],
    queryFn: () => listQuotes(eventId, stageId, advanceId),
    enabled: !!eventId && !!stageId && !!advanceId,
  });

  const create = useMutation({
    mutationFn: (input: QuoteInput) => createQuote(eventId, stageId, advanceId, input, uid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotes', eventId, stageId, advanceId] });
      setCreating(false);
    },
    onError: (err) => logger.error('Failed to create quote', err),
  });

  const quotes = quotesQuery.data ?? [];

  return (
    <div className="space-y-3 border-t border-line pt-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-brand">Quotes</h2>
        {canEdit && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
          >
            New quote
          </button>
        )}
      </div>

      {quotesQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {quotesQuery.isError && <p className="text-sm text-accent">Failed to load quotes.</p>}

      {creating && (
        <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
          <h3 className="mb-3 font-semibold text-brand">New quote</h3>
          <QuoteForm
            submitLabel="Create quote"
            pending={create.isPending}
            error={create.isError ? 'Could not create the quote.' : null}
            onSubmit={(input) => create.mutate(input)}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {!quotesQuery.isLoading && quotes.length === 0 && !creating && (
        <p className="text-sm text-ink-muted">No quotes yet for this advance.</p>
      )}

      {quotes.map((quote) => (
        <QuoteCard
          key={quote.id}
          eventId={eventId}
          stageId={stageId}
          advanceId={advanceId}
          uid={uid}
          canEdit={canEdit}
          quote={quote}
        />
      ))}
    </div>
  );
}
