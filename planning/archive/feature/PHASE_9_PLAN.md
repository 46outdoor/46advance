# Phase 9 — Quotes / Estimates — execution plan

ROADMAP §9: **lightweight line-item quotes for artist-covered expenses**, attached to an
**artist advance**, with **in-app PM approve/reject + status + audit**, **PDF export**
(shared server renderer, reuses Phase 7 infra), and **signed-copy upload** for the record.

> **Status: APPROVED — decisions locked 2026-06-23.** Branch `feature/phase-9-quotes`, PR → `main`.

## Decisions (locked)
1. **Attach level:** **per artist advance** *(user)* — quotes live under the advance.
2. **Approval:** in-app **PM/admin approve/reject** with status + audit (decided-by/at/note);
   client writes, enforced by firestore.rules (mirrors section finalize — rides the PM/admin
   write gate; the status state machine is validated in the model).
3. **PDF:** **server-side** (`generateQuotePdf`), reusing the functions PDF lib (consistent
   with packets; one renderer for web + mobile).
4. **Signed copy:** uploaded to `events/{id}/quotes/{quoteId}/...` (covered by existing
   storage.rules — member read, PM/admin write); path stored on the quote.

## Data model (new)
`events/{eventId}/stages/{stageId}/advances/{advanceId}/quotes/{quoteId}`:
`title · status (draft→sent→approved/rejected) · lineItems[{description, quantity, unitPrice}]
· notes · createdBy/At · updatedAt · decisionBy/At/Note · signedCopyPath`. Total is computed
(qty×unitPrice), not stored. Amounts are plain dollars (number, ≥ 0).

## Workstreams
### 9.1 Quote model  [A]
- `src/lib/quotes/quote.ts` — types + Zod + parser + **pure** helpers (`lineItemTotal`,
  `quoteTotal`, `formatMoney`, status labels, `isValidQuoteTransition`). Unit tests.

### 9.2 Service  [A]
- `src/features/events/quotes-service.ts` — list/create/update/delete; `setQuoteStatus`
  (stamps decision fields on approve/reject, clears otherwise); `attachSignedCopy`
  (reuse `@/lib/storage/uploads`) + `removeSignedCopy`; `generateQuotePdf` client wrapper.

### 9.3 PDF function  [A]
- `functions/src/lib/pdf/quote.tsx` — branded single-page quote (header, line-item table,
  total, status, notes). `generateQuotePdf` onCall (admin or member) → render → upload to
  `events/{id}/quotes/{quoteId}/quote-{ts}.pdf` → `{ path }`.

### 9.4 Rules + tests  [A]
- firestore.rules: `quotes` under the advance — member read; PM/admin create (createdBy ==
  uid) / update / delete. Rules tests mirror the advances block (read/create/update/delete by role).

### 9.5 UI  [A]
- `QuotesPanel` on the advance detail (list + totals + status), `QuoteForm` (line-item
  editor), `QuoteStatusBadge`; actions: mark sent / approve / reject (with note), generate
  PDF (opens), upload/replace signed copy. PM/admin gated; members read.

### 9.6 Verify + ship  [A] → deploy
- typecheck · lint · unit · rules · arch · build green; PR; squash-merge on green CI; **deploy
  functions + firestore:rules** (never hosting). Update AGENTS canonical sources, ROADMAP, memory.

## Out of scope (later)
E-signature integration · multi-currency · event-level quotes · quote templates · approvals
routed via notifications (Slack — later).

## Exit criteria
Create a quote on an advance → add line items → generate a branded PDF → PM approves/rejects
(status + audit) → upload the signed copy. Rules enforce PM/admin writes. CI green; deployed.
