/**
 * Global contact directory data access (`contacts/{contactId}`). Shared lib so both the
 * contacts feature (manage) and the events feature (attach) use one source of truth
 * (no-cross-feature). Reads/writes gated by firestore.rules: signed-in read/create;
 * creator/admin update/delete.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { parseContact, type Contact, type ContactInput, type ContactPhoto } from './contact';

function contactsCol() {
  return collection(db, 'contacts');
}

/** All contacts, sorted by name. */
export async function listContacts(): Promise<Contact[]> {
  const snap = await getDocs(contactsCol());
  return snap.docs.map((d) => parseContact(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name));
}

function toDoc(input: ContactInput) {
  return {
    name: input.name,
    role: input.role ?? null,
    company: input.company ?? null,
    phone: input.phone ?? null,
    email: input.email ? input.email : null,
    notes: input.notes ?? null,
    photo: input.photo ?? null,
  };
}

export async function createContact(input: ContactInput, creatorUid: string): Promise<string> {
  const ref = await addDoc(contactsCol(), {
    ...toDoc(input),
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateContact(contactId: string, input: ContactInput): Promise<void> {
  await updateDoc(doc(db, 'contacts', contactId), { ...toDoc(input), updatedAt: serverTimestamp() });
}

export async function deleteContact(contactId: string): Promise<void> {
  await deleteDoc(doc(db, 'contacts', contactId));
}

/** The directory entry linked to this user's account (their own contact), or null. */
export async function getMyContact(uid: string): Promise<Contact | null> {
  const snap = await getDocs(query(contactsCol(), where('userId', '==', uid), limit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return parseContact(d.id, d.data());
}

/** Set (or clear) just the photo on a contact. */
export async function setContactPhoto(contactId: string, photo: ContactPhoto | null): Promise<void> {
  await updateDoc(doc(db, 'contacts', contactId), { photo, updatedAt: serverTimestamp() });
}
