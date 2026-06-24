/**
 * Department model (`departments/{deptId}`) — the app-wide, admin-managed list. Each
 * event enables a subset (`events.departmentIds`); an advance renders one section per
 * enabled department. Shared lib (admin manages, events consume).
 */
import { z } from 'zod';

export interface DepartmentRecord {
  id: string;
  name: string;
  order: number;
}

/** Seeded on first run (stable slug ids). Confirmed with the user 2026-06-23. */
export const DEFAULT_DEPARTMENTS: ReadonlyArray<DepartmentRecord> = [
  { id: 'audio', name: 'Audio', order: 0 },
  { id: 'lighting', name: 'Lighting', order: 1 },
  { id: 'video-led', name: 'Video/LED', order: 2 },
  { id: 'logistics', name: 'Logistics', order: 3 },
  { id: 'labor', name: 'Labor', order: 4 },
  { id: 'artist-relations', name: 'Artist Relations', order: 5 },
];

const departmentDocSchema = z.object({
  name: z.string().min(1),
  order: z.number().optional(),
});

export function parseDepartment(id: string, data: unknown): DepartmentRecord {
  const doc = departmentDocSchema.parse(data);
  return { id, name: doc.name, order: doc.order ?? 0 };
}

export const departmentInputSchema = z.object({
  name: z.string().trim().min(1, 'Department name is required.'),
});
export type DepartmentInput = z.infer<typeof departmentInputSchema>;
