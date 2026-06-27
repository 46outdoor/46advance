/**
 * Quote data access (`events/{e}/stages/{s}/advances/{a}/quotes/{q}`). Co-located in the
 * events feature; domain model + helpers in shared @/lib/quotes. Reads/writes gated by
 * firestore.rules (member read; PM/admin write). PDF is generated server-side.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, functions, storage } from '@/services/firebase';
import { parseQuote, isDecisionStatus, type Quote, type QuoteInput, type QuoteStatus } from '@/lib/quotes/quote';
import { deleteFile, uploadFile } from '@/lib/storage/uploads';
import type { GenerateQuotePdfInput, PdfPathOutput } from '@contracts/callables/pdf';

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
  const decision = isDecisionStatus(status)
    ? { decisionBy: uid, decisionAt: serverTimestamp(), decisionNote: note?.trim() || null }
    : { decisionBy: null, decisionAt: null, decisionNote: null };
  await updateDoc(quoteDoc(eventId, stageId, advanceId, quoteId), {
    status,
    ...decision,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteQuote(
  eventId: string,
  stageId: string,
  advanceId: string,
  quoteId: string,
): Promise<void> {
  await deleteDoc(quoteDoc(eventId, stageId, advanceId, quoteId));
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
  await uploadFile(path, file);
  await updateDoc(quoteDoc(eventId, stageId, advanceId, quoteId), {
    signedCopyPath: path,
    updatedAt: serverTimestamp(),
  });
  if (previousPath) await deleteFile(previousPath).catch(() => undefined);
}

/** Remove the signed copy (Storage object + path on the doc). */
export async function removeSignedCopy(
  eventId: string,
  stageId: string,
  advanceId: string,
  quoteId: string,
  path: string,
): Promise<void> {
  await deleteFile(path).catch(() => undefined);
  await updateDoc(quoteDoc(eventId, stageId, advanceId, quoteId), {
    signedCopyPath: null,
    updatedAt: serverTimestamp(),
  });
}

/** Resolve a download URL for a stored file path (member-gated by storage.rules). */
export function getFileUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

/**
 * Generate a branded PDF for a quote (server render). The callable uploads to Storage and
 * returns its path; we resolve a member-gated download URL. Returns the URL.
 */
export async function generateQuotePdf(
  eventId: string,
  stageId: string,
  advanceId: string,
  quoteId: string,
): Promise<string> {
  const callable = httpsCallable<GenerateQuotePdfInput, PdfPathOutput>(functions, 'generateQuotePdf');
  const result = await callable({ eventId, stageId, advanceId, quoteId });
  return getDownloadURL(ref(storage, result.data.path));
}
