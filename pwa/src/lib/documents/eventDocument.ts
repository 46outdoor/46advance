/**
 * Event document model (`events/{e}/documents/{fileId}`, Documents PR 4 —
 * planning/DOCUMENTS_FEATURE.md decision 5). A Drive file uploaded to (or living in)
 * the event's linked Drive folder, recorded per event and grouped by the schedule's
 * day keys — `day` is the same 'YYYY-MM-DD' key `scheduleDays` uses (null =
 * event-wide), so the documents view shares the schedule's day headers. The doc id IS
 * the Drive file id.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import { isValidDateKey } from '@/lib/dates/parsing';

export interface EventDocument {
  /** = the Drive file id. */
  id: string;
  fileId: string;
  name: string;
  displayName: string | null;
  mimeType: string;
  iconLink: string | null;
  webViewLink: string;
  /** Schedule day key ('YYYY-MM-DD'); null = event-wide. */
  day: string | null;
  categoryId: string | null;
  uploadedBy: string;
  uploadedAt: Date | null;
}

const dayKeySchema = z.string().refine(isValidDateKey, 'Use a real YYYY-MM-DD date.');

const eventDocumentDocSchema = z.object({
  fileId: z.string().min(1),
  name: z.string().min(1),
  displayName: z.string().nullable().optional(),
  mimeType: z.string().optional(),
  iconLink: z.string().nullable().optional(),
  webViewLink: z.string().min(1),
  day: dayKeySchema.nullable().optional(),
  categoryId: z.string().nullable().optional(),
  uploadedBy: z.string().min(1),
  uploadedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** Validate + normalize a raw event-document doc (id must equal the Drive file id). */
export function parseEventDocument(id: string, data: unknown): EventDocument {
  const d = eventDocumentDocSchema.parse(data);
  if (d.fileId !== id) {
    throw new Error(`Event-document id "${id}" must equal its fileId "${d.fileId}".`);
  }
  return {
    id,
    fileId: d.fileId,
    name: d.name,
    displayName: d.displayName ?? null,
    mimeType: d.mimeType ?? 'application/octet-stream',
    iconLink: d.iconLink ?? null,
    webViewLink: d.webViewLink,
    day: d.day ?? null,
    categoryId: d.categoryId ?? null,
    uploadedBy: d.uploadedBy,
    uploadedAt: timestampToDate(d.uploadedAt ?? null),
  };
}

/** Client-supplied fields when recording/editing an event document. */
export const eventDocumentInputSchema = z.object({
  day: dayKeySchema.nullable().optional(),
  categoryId: z.string().nullable().optional(),
  displayName: z.string().trim().optional(),
});
export type EventDocumentInput = z.infer<typeof eventDocumentInputSchema>;

export interface EventDocumentDayGroup {
  /** The day key, or null for the event-wide group (always sorted last). */
  day: string | null;
  documents: EventDocument[];
}

/** Group documents by day key (sorted ascending, event-wide last); docs within a group
 * sort by display title. */
export function groupEventDocumentsByDay(docs: readonly EventDocument[]): EventDocumentDayGroup[] {
  const byDay = new Map<string | null, EventDocument[]>();
  for (const doc of docs) {
    const key = doc.day;
    const group = byDay.get(key);
    if (group) group.push(doc);
    else byDay.set(key, [doc]);
  }
  for (const group of byDay.values()) {
    group.sort((a, b) => (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name));
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
    .map(([day, documents]) => ({ day, documents }));
}
