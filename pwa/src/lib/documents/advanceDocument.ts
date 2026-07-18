/**
 * Advance document inclusion (`events/{e}/stages/{s}/advances/{a}/documents/{docId}`,
 * Documents PR 3 — planning/DOCUMENTS_FEATURE.md decisions 3/4). The doc id IS the
 * included `artistDocuments` id (= its Drive fileId), so include/exclude is an
 * idempotent set/delete keyed by the library doc and double-inclusion is structural
 * nonsense. Display fields are copied from the library entry at include time so the
 * advance renders stably even if the library entry is later edited or deleted.
 * `includePacket` is stored from day one but only surfaced by the packet-embedding PR
 * (decision 1 — no dead toggle before it works).
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import type { ArtistDocument } from './artistDocument';

export interface AdvanceDocument {
  /** = the `artistDocuments` id (= the Drive file id). */
  id: string;
  fileId: string;
  name: string;
  displayName: string | null;
  mimeType: string;
  iconLink: string | null;
  webViewLink: string;
  categoryId: string | null;
  /** Embed this file in the generated packet (surfaced by the packet-embedding PR). */
  includePacket: boolean;
  addedBy: string;
  addedAt: Date | null;
}

const advanceDocumentDocSchema = z.object({
  fileId: z.string().min(1),
  name: z.string().min(1),
  displayName: z.string().nullable().optional(),
  mimeType: z.string().optional(),
  iconLink: z.string().nullable().optional(),
  webViewLink: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  includePacket: z.boolean().optional(),
  addedBy: z.string().min(1),
  addedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** Validate + normalize a raw advance-document doc. Enforces the structural invariant
 * that the doc id IS the included file's id. */
export function parseAdvanceDocument(id: string, data: unknown): AdvanceDocument {
  const d = advanceDocumentDocSchema.parse(data);
  if (d.fileId !== id) {
    throw new Error(`Advance-document id "${id}" must equal its fileId "${d.fileId}".`);
  }
  return {
    id,
    fileId: d.fileId,
    name: d.name,
    displayName: d.displayName ?? null,
    mimeType: d.mimeType ?? 'application/octet-stream',
    iconLink: d.iconLink ?? null,
    webViewLink: d.webViewLink,
    categoryId: d.categoryId ?? null,
    includePacket: d.includePacket ?? false,
    addedBy: d.addedBy,
    addedAt: timestampToDate(d.addedAt ?? null),
  };
}

/** The stored payload for including a library doc on an advance (fields copied for
 * display stability; timestamps/audit added by the service). */
export function advanceDocumentPayload(
  doc: Pick<
    ArtistDocument,
    'fileId' | 'name' | 'displayName' | 'mimeType' | 'iconLink' | 'webViewLink' | 'categoryId'
  >,
): Omit<AdvanceDocument, 'id' | 'includePacket' | 'addedBy' | 'addedAt'> {
  return {
    fileId: doc.fileId,
    name: doc.name,
    displayName: doc.displayName,
    mimeType: doc.mimeType,
    iconLink: doc.iconLink,
    webViewLink: doc.webViewLink,
    categoryId: doc.categoryId,
  };
}
