/**
 * Document category model (`documentCategories/{id}`) — the app-wide, admin-managed list of
 * artist-document types. Each imported document is classified with one. Shared lib (admin
 * manages, the documents library consumes). Mirrors @/lib/departments/department.
 */
import { z } from 'zod';

export interface DocumentCategory {
  id: string;
  name: string;
  order: number;
}

/** The initial set (stable slug ids), seeded on first run. Admins add more. */
export const DEFAULT_DOCUMENT_CATEGORIES: ReadonlyArray<DocumentCategory> = [
  { id: 'tech-rider', name: 'Tech Rider', order: 0 },
  { id: 'stage-plot', name: 'Stage Plot', order: 1 },
  { id: 'input-list', name: 'Input List', order: 2 },
  { id: 'media', name: 'Media', order: 3 },
  { id: 'hospitality-rider', name: 'Hospitality Rider', order: 4 },
  { id: 'contract', name: 'Contract', order: 5 },
  { id: 'other', name: 'Other', order: 6 },
];

const documentCategoryDocSchema = z.object({
  name: z.string().min(1),
  order: z.number().optional(),
});

export function parseDocumentCategory(id: string, data: unknown): DocumentCategory {
  const doc = documentCategoryDocSchema.parse(data);
  return { id, name: doc.name, order: doc.order ?? 0 };
}

export const documentCategoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required.'),
});
export type DocumentCategoryInput = z.infer<typeof documentCategoryInputSchema>;
