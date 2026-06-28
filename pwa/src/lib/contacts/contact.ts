/**
 * Contact/personnel model (ROADMAP §11): app-wide reference data at `contacts/{contactId}`,
 * distinct from RBAC users. Reusable across events (attached via
 * `events/{eventId}/contacts/{attachId}`). Types + Zod + parser + pure helpers live together
 * (mirrors @/lib/advances/advance).
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';

/** Crop rectangle (natural pixels) + the original image's natural size, so a square avatar
 *  can show the chosen region via CSS — letting the user reframe without re-uploading. */
const cropRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  natW: z.number(),
  natH: z.number(),
});
export type CropRect = z.infer<typeof cropRectSchema>;

/** Profile picture: a Storage path (for deletion), its download URL, and an optional crop. */
const contactPhotoSchema = z.object({
  path: z.string().min(1),
  url: z.string().min(1),
  crop: cropRectSchema.nullable().optional(),
});
export type ContactPhoto = z.infer<typeof contactPhotoSchema>;

export interface Contact {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  /** Profile picture, shown beside the name; null when none uploaded. */
  photo: ContactPhoto | null;
  /** Set when this contact mirrors a user account (auto-populated on sign-in); null otherwise. */
  userId: string | null;
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
  photo: contactPhotoSchema.nullable().optional(),
  userId: z.string().nullable().optional(),
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
    photo: doc.photo ?? null,
    userId: doc.userId ?? null,
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
  photo: contactPhotoSchema.nullable().optional(),
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

/** Last word of the contact's name (used for last-name sorting). */
export function contactLastName(contact: Pick<Contact, 'name'>): string {
  const parts = contact.name.trim().split(/\s+/);
  return parts.length > 1 ? (parts[parts.length - 1] ?? '') : (parts[0] ?? '');
}

/** Up to two initials from the name, for the avatar placeholder. */
export function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/**
 * CSS box (percentages) that scales+offsets the original image inside a square, overflow-hidden
 * avatar so the crop rectangle fills it exactly. Lets the avatar show a reframable crop with no
 * canvas/re-upload.
 */
export function photoCropStyle(crop: CropRect): { width: string; height: string; left: string; top: string } {
  return {
    width: `${(crop.natW / crop.width) * 100}%`,
    height: `${(crop.natH / crop.height) * 100}%`,
    left: `${(-crop.x / crop.width) * 100}%`,
    top: `${(-crop.y / crop.height) * 100}%`,
  };
}

/** True if the query (case-insensitive) matches the contact's name, phone, email, or role/title. */
export function matchesContactQuery(contact: Contact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [contact.name, contact.phone, contact.email, contact.role].some((field) =>
    field ? field.toLowerCase().includes(q) : false,
  );
}

export type ContactSort = 'first' | 'last';

/** Sort contacts by first name (full name) or last name (ties fall back to full name). */
export function sortContacts(contacts: readonly Contact[], by: ContactSort): Contact[] {
  return [...contacts].sort((a, b) =>
    by === 'last'
      ? contactLastName(a).localeCompare(contactLastName(b)) || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name),
  );
}
