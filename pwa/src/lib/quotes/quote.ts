/**
 * Quote/estimate model (ROADMAP §9): a lightweight line-item quote for artist-covered
 * expenses, attached to an advance at
 * `events/{eventId}/stages/{stageId}/advances/{advanceId}/quotes/{quoteId}`.
 * Types + Zod + parser + pure helpers live together (mirrors @/lib/advances/advance).
 * Amounts are plain dollars (number, ≥ 0); the total is computed, never stored.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';

/** draft → sent (to PM) → approved | rejected; approved/rejected can reopen to sent. */
export const QUOTE_STATUSES = ['draft', 'sent', 'approved', 'rejected'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const quoteStatusSchema = z.enum(QUOTE_STATUSES);

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  rejected: 'Rejected',
};

export interface QuoteLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Quote {
  id: string;
  title: string;
  status: QuoteStatus;
  lineItems: QuoteLineItem[];
  notes: string | null;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** Audit of the approve/reject decision. */
  decisionBy: string | null;
  decisionAt: Date | null;
  decisionNote: string | null;
  /** Storage path of the uploaded signed copy, if any. */
  signedCopyPath: string | null;
}

const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
});

const quoteDocSchema = z.object({
  title: z.string().min(1),
  status: quoteStatusSchema,
  lineItems: z.array(lineItemSchema).optional(),
  notes: z.string().nullable().optional(),
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
  decisionBy: z.string().nullable().optional(),
  decisionAt: z.instanceof(Timestamp).nullable().optional(),
  decisionNote: z.string().nullable().optional(),
  signedCopyPath: z.string().nullable().optional(),
});

/** Validate + normalize a raw quote doc. */
export function parseQuote(id: string, data: unknown): Quote {
  const doc = quoteDocSchema.parse(data);
  return {
    id,
    title: doc.title,
    status: doc.status,
    lineItems: doc.lineItems ?? [],
    notes: doc.notes ?? null,
    createdBy: doc.createdBy,
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
    decisionBy: doc.decisionBy ?? null,
    decisionAt: timestampToDate(doc.decisionAt ?? null),
    decisionNote: doc.decisionNote ?? null,
    signedCopyPath: doc.signedCopyPath ?? null,
  };
}

/** Client-supplied fields when creating/editing a quote. */
export const quoteInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.'),
  notes: z.string().trim().optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Describe the line item.'),
        quantity: z.number().nonnegative('Quantity must be ≥ 0.'),
        unitPrice: z.number().nonnegative('Unit price must be ≥ 0.'),
      }),
    )
    .min(1, 'Add at least one line item.'),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

/** Extended price of one line (quantity × unit price). */
export function lineItemTotal(item: QuoteLineItem): number {
  return item.quantity * item.unitPrice;
}

/** Sum of all line-item totals. */
export function quoteTotal(items: readonly QuoteLineItem[]): number {
  return items.reduce((sum, item) => sum + lineItemTotal(item), 0);
}

const MONEY_FMT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Format a dollar amount as USD currency. */
export function formatMoney(amount: number): string {
  return MONEY_FMT.format(amount);
}

const ALLOWED_QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ['sent'],
  sent: ['draft', 'approved', 'rejected'],
  approved: ['sent'], // reopen
  rejected: ['sent'], // reopen
};

/** Is moving a quote from `from` → `to` allowed by the lifecycle? (No-op allowed.) */
export function isValidQuoteTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return from === to || ALLOWED_QUOTE_TRANSITIONS[from].includes(to);
}

/** A decision status stamps the audit fields; any other clears them. */
export function isDecisionStatus(status: QuoteStatus): boolean {
  return status === 'approved' || status === 'rejected';
}
