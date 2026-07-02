import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  isDecisionStatus,
  isValidQuoteTransition,
  lineItemTotal,
  parseQuote,
  quoteInputSchema,
  quoteTotal,
} from './quote';

describe('quote totals', () => {
  it('computes a line item total', () => {
    expect(lineItemTotal({ description: 'Mics', quantity: 4, unitPrice: 25 })).toBe(100);
  });

  it('sums all line items', () => {
    expect(
      quoteTotal([
        { description: 'A', quantity: 2, unitPrice: 50 },
        { description: 'B', quantity: 1, unitPrice: 30.5 },
      ]),
    ).toBe(130.5);
  });

  it('is 0 for no line items', () => {
    expect(quoteTotal([])).toBe(0);
  });
});

describe('formatMoney', () => {
  it('formats USD', () => {
    expect(formatMoney(130.5)).toBe('$130.50');
    expect(formatMoney(0)).toBe('$0.00');
  });
});

describe('quote lifecycle', () => {
  it('allows draft → sent and the decision steps', () => {
    expect(isValidQuoteTransition('draft', 'sent')).toBe(true);
    expect(isValidQuoteTransition('sent', 'approved')).toBe(true);
    expect(isValidQuoteTransition('sent', 'rejected')).toBe(true);
  });

  it('allows reopening an approved/rejected quote to sent', () => {
    expect(isValidQuoteTransition('approved', 'sent')).toBe(true);
    expect(isValidQuoteTransition('rejected', 'sent')).toBe(true);
  });

  it('rejects skipping straight from draft to approved', () => {
    expect(isValidQuoteTransition('draft', 'approved')).toBe(false);
  });

  it('treats a no-op transition as valid', () => {
    expect(isValidQuoteTransition('approved', 'approved')).toBe(true);
  });

  it('flags approved/rejected as decision statuses', () => {
    expect(isDecisionStatus('approved')).toBe(true);
    expect(isDecisionStatus('rejected')).toBe(true);
    expect(isDecisionStatus('sent')).toBe(false);
    expect(isDecisionStatus('draft')).toBe(false);
  });
});

describe('quoteInputSchema', () => {
  it('accepts a valid quote', () => {
    const result = quoteInputSchema.safeParse({
      title: 'Backline rental',
      lineItems: [{ description: 'Amp', quantity: 1, unitPrice: 200 }],
    });
    expect(result.success).toBe(true);
  });

  it('requires at least one line item', () => {
    const result = quoteInputSchema.safeParse({ title: 'Empty', lineItems: [] });
    expect(result.success).toBe(false);
  });

  it('rejects negative amounts', () => {
    const result = quoteInputSchema.safeParse({
      title: 'Bad',
      lineItems: [{ description: 'X', quantity: -1, unitPrice: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-finite amounts (Infinity / NaN)', () => {
    expect(
      quoteInputSchema.safeParse({ title: 'Inf', lineItems: [{ description: 'X', quantity: Infinity, unitPrice: 10 }] }).success,
    ).toBe(false);
    expect(
      quoteInputSchema.safeParse({ title: 'NaN', lineItems: [{ description: 'X', quantity: 1, unitPrice: NaN }] }).success,
    ).toBe(false);
  });

  it('rejects a blank title', () => {
    const result = quoteInputSchema.safeParse({
      title: '   ',
      lineItems: [{ description: 'X', quantity: 1, unitPrice: 10 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('parseQuote', () => {
  it('normalizes a minimal doc', () => {
    const quote = parseQuote('q1', { title: 'T', status: 'draft', createdBy: 'u1' });
    expect(quote.id).toBe('q1');
    expect(quote.lineItems).toEqual([]);
    expect(quote.notes).toBeNull();
    expect(quote.decisionBy).toBeNull();
    expect(quote.signedCopyPath).toBeNull();
  });

  it('sanitizes a negative or non-finite stored amount to 0 (protects artist-facing totals)', () => {
    const quote = parseQuote('q2', {
      title: 'T',
      status: 'sent',
      createdBy: 'u1',
      lineItems: [
        { description: 'bad-qty', quantity: -5, unitPrice: 10 },
        { description: 'inf-price', quantity: 2, unitPrice: Infinity },
        { description: 'ok', quantity: 3, unitPrice: 4 },
      ],
    });
    expect(quote.lineItems[0].quantity).toBe(0);
    expect(quote.lineItems[1].unitPrice).toBe(0);
    expect(quote.lineItems[2]).toEqual({ description: 'ok', quantity: 3, unitPrice: 4 });
  });
});
