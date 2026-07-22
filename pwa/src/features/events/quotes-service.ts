/**
 * Quote data access (`events/{e}/stages/{s}/advances/{a}/quotes/{q}`). Co-located in the
 * events feature; domain model + helpers in shared @/lib/quotes. Reads/writes gated by
 * firestore.rules (member read; PM/admin write). PDF is generated server-side.
 */
import {
  addDoc,
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, functions, storage } from '@/services/firebase';
import { deleteQuoteCascade } from './event-cleanup-service';
import {
  parseQuote,
  isDecisionStatus,
  isValidQuoteTransition,
  type Quote,
  type QuoteInput,
  type QuoteStatus,
} from '@/lib/quotes/quote';
import { deleteFile, replaceStoredAsset, uploadFile } from '@/lib/storage/uploads';
import type { GenerateQuotePdfInput, GenerateQuotePdfOutput } from '@contracts/callables/pdf';

function quotesCol(eventId: string, stageId: string, advanceId: string) {
  return collection(db, 'events', eventId, 'stages', stageId, 'advances', advanceId, 'quotes');
}

function quoteDoc(eventId: string, stageId: string, advanceId: string, quoteId: string) {
  return doc(db, 'events', eventId, 'stages', stageId, 'advances', advanceId, 'quotes', quoteId);
}

export async function listQuotes(
  eventId: string,
  stageId: string,
  advanceId: string,
): Promise<Quote[]> {
  const snap = await getDocs(quotesCol(eventId, stageId, advanceId));
  return snap.docs
    .map((d) => parseQuote(d.id, d.data()))
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/** Create a quote (starts in draft). */
export async function createQuote(
  eventId: string,
  stageId: string,
  advanceId: string,
  input: QuoteInput,
  creatorUid: string,
): Promise<string> {
  const ref = await addDoc(quotesCol(eventId, stageId, advanceId), {
    title: input.title,
    status: 'draft' satisfies QuoteStatus,
    lineItems: input.lineItems,
    notes: input.notes ?? null,
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    decisionBy: null,
    decisionAt: null,
    decisionNote: null,
    signedCopyPath: null,
  });
  return ref.id;
}

/** Edit a quote's content (title / line items / notes). */
export async function updateQuote(
  eventId: string,
  stageId: string,
  advanceId: string,
  quoteId: string,
  input: QuoteInput,
): Promise<void> {
  await updateDoc(quoteDoc(eventId, stageId, advanceId, quoteId), {
    title: input.title,
    lineItems: input.lineItems,
    notes: input.notes ?? null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Change a quote's status. approved/rejected stamp the decision audit (by/at + note);
 * any other status clears it. Permission enforced by rules (PM/admin write).
 */
export async function setQuoteStatus(
  eventId: string,
  stageId: string,
  advanceId: string,
  quoteId: string,
  status: QuoteStatus,
  uid: string,
  note?: string,
): Promise<void> {
  const targetRef = quoteDoc(eventId, stageId, advanceId, quoteId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(targetRef);
    if (!snap.exists()) throw new Error('Quote not found.');
    const current = parseQuote(snap.id, snap.data()).status;
    // The lifecycle (draft → sent → approved|rejected, with reopen) is enforced here — rules
    // gate who can write but can't compare prior→next status. An illegal jump throws.
    if (!isValidQuoteTransition(current, status)) {
      throw new Error(`Illegal quote status change: ${current} → ${status}.`);
    }
    const decision = isDecisionStatus(status)
      ? { decisionBy: uid, decisionAt: serverTimestamp(), decisionNote: note?.trim() || null }
      : { decisionBy: null, decisionAt: null, decisionNote: null };
    tx.update(targetRef, { status, ...decision, updatedAt: serverTimestamp() });
  });
}

export async function deleteQuote(
  eventId: string,
  stageId: string,
  advanceId: string,
  quoteId: string,
): Promise<void> {
  // Server-side delete (F-7): also removes the signed copy + generated PDFs in Storage.
  await deleteQuoteCascade(eventId, stageId, advanceId, quoteId);
}

/** Upload (or replace) the signed copy for a quote; stores its Storage path on the doc. */
export async function attachSignedCopy(
  eventId: string,
  stageId: string,
  advanceId: string,
  quoteId: string,
  file: File,
  previousPath: string | null,
): Promise<void> {
  const path = `events/${eventId}/quotes/${quoteId}/signed-${Date.now()}-${file.name}`;
  // Compensating replace (F-5): drop the new object if the doc write fails; delete the previous
  // signed copy only after the new path is durably on the doc.
  await replaceStoredAsset(
    () => uploadFile(path, file),
    (uploaded) =>
      updateDoc(quoteDoc(eventId, stageId, advanceId, quoteId), {
        signedCopyPath: uploaded.path,
        updatedAt: serverTimestamp(),
      }),
    previousPath,
  );
}

/** Remove the signed copy (Storage object + path on the doc). */
export async function removeSignedCopy(
  eventId: string,
  stageId: string,
  advanceId: string,
  quoteId: string,
  path: string,
): Promise<void> {
  // Clear the reference first, then best-effort delete the object — a failed delete leaves a
  // harmless orphan rather than a doc pointing at a deleted file.
  await updateDoc(quoteDoc(eventId, stageId, advanceId, quoteId), {
    signedCopyPath: null,
    updatedAt: serverTimestamp(),
  });
  await deleteFile(path).catch(() => undefined);
}

/** Resolve a download URL for a stored file path (member-gated by storage.rules). */
export function getFileUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

/**
 * Generate a branded PDF for a quote (server render). Returns a signed, expiring
 * (7-day) URL for sharing with the artist; falls back to a member-gated download
 * URL if URL signing isn't configured. Returns the URL.
 */
export async function generateQuotePdf(
  eventId: string,
  stageId: string,
  advanceId: string,
  quoteId: string,
): Promise<string> {
  const callable = httpsCallable<GenerateQuotePdfInput, GenerateQuotePdfOutput>(functions, 'generateQuotePdf');
  const { path, url } = (await callable({ eventId, stageId, advanceId, quoteId })).data;
  // Prefer the server's signed, expiring URL (shareable with the artist); fall back
  // to a member-gated download if signing isn't configured.
  return url ?? getDownloadURL(ref(storage, path));
}
