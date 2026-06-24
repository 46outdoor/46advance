/**
 * Event/festival document model: `events/{eventId}`. One event holds many
 * advances. Types + Zod schemas + the Firestore parser live together
 * (mirrors src/lib/rbac). Phase 1 created a stub `events` doc for rules tests;
 * this is the real shape.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';

export const EVENT_STATUSES = ['draft', 'active', 'archived'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const eventStatusSchema = z.enum(EVENT_STATUSES);

export interface EventRecord {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  venue: string | null;
  status: EventStatus;
  /** Enabled departments (ids) — drive the advance's sections. */
  departmentIds: string[];
  /** Google calendar created for this event (Phase 11b); null until connected + created. */
  googleCalendarId: string | null;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const eventDocSchema = z.object({
  name: z.string().min(1),
  startDate: z.instanceof(Timestamp).nullable().optional(),
  endDate: z.instanceof(Timestamp).nullable().optional(),
  venue: z.string().nullable().optional(),
  status: eventStatusSchema,
  departmentIds: z.array(z.string()).optional(),
  googleCalendarId: z.string().nullable().optional(),
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** Validate + normalize a raw event doc. */
export function parseEvent(id: string, data: unknown): EventRecord {
  const doc = eventDocSchema.parse(data);
  return {
    id,
    name: doc.name,
    startDate: timestampToDate(doc.startDate ?? null),
    endDate: timestampToDate(doc.endDate ?? null),
    venue: doc.venue ?? null,
    status: doc.status,
    departmentIds: doc.departmentIds ?? [],
    googleCalendarId: doc.googleCalendarId ?? null,
    createdBy: doc.createdBy,
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

/** Client-supplied fields when creating/editing an event. */
export const eventInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Event name is required.'),
    startDate: z.date().nullable().optional(),
    endDate: z.date().nullable().optional(),
    venue: z.string().trim().optional(),
    status: eventStatusSchema.optional(),
    departmentIds: z.array(z.string()).optional(),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate,
    { message: 'End date must be on or after the start date.', path: ['endDate'] },
  );
export type EventInput = z.infer<typeof eventInputSchema>;
