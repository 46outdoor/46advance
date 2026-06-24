/**
 * Contact/personnel model (ROADMAP §11): app-wide reference data at `contacts/{contactId}`,
 * distinct from RBAC users. Reusable across events (attached via
 * `events/{eventId}/contacts/{attachId}`). Types + Zod + parser + pure helpers live together
 * (mirrors @/lib/advances/advance).
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';

export interface Contact {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const contactDocSchema = z.object({
  name: z.string().min(1),
  role: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** Validate + normalize a raw contact doc. */
export function parseContact(id: string, data: unknown): Contact {
  const doc = contactDocSchema.parse(data);
  return {
    id,
    name: doc.name,
    role: doc.role ?? null,
    company: doc.company ?? null,
    phone: doc.phone ?? null,
    email: doc.email ?? null,
    notes: doc.notes ?? null,
    createdBy: doc.createdBy,
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

/** Client-supplied fields when creating/editing a contact. Email validated when present. */
export const contactInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  role: z.string().trim().optional(),
  company: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.union([z.string().trim().email('Enter a valid email.'), z.literal('')]).optional(),
  notes: z.string().trim().optional(),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

/** `tel:` href (digits/+ only), or null when there's no phone. */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
}

/** `mailto:` href, or null when there's no email. */
export function mailtoHref(email: string | null): string | null {
  return email ? `mailto:${email}` : null;
}

/** One-line summary: "Role · Company", collapsing empties. */
export function contactSubtitle(contact: Pick<Contact, 'role' | 'company'>): string {
  return [contact.role, contact.company].filter(Boolean).join(' · ');
}
