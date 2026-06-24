/**
 * Production record data access (`events/{id}/production/record`). Event-level here;
 * stage-level added in 5.3. Reads/writes gated by firestore.rules (member read,
 * PM/admin write).
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { SectionContent } from '@/lib/advances/fields';
import {
  emptyEventProduction,
  parseEventProduction,
  type EventProduction,
  type ProductionContact,
  type ProductionLink,
} from '@/lib/production/production';

function eventProductionDoc(eventId: string) {
  return doc(db, 'events', eventId, 'production', 'record');
}

export async function getEventProduction(eventId: string): Promise<EventProduction> {
  const snap = await getDoc(eventProductionDoc(eventId));
  return snap.exists() ? parseEventProduction(snap.data()) : emptyEventProduction();
}

export async function setEventProductionInfo(eventId: string, info: SectionContent): Promise<void> {
  await setDoc(eventProductionDoc(eventId), { info, updatedAt: serverTimestamp() }, { merge: true });
}

export async function setEventProductionContacts(
  eventId: string,
  contacts: ProductionContact[],
): Promise<void> {
  await setDoc(eventProductionDoc(eventId), { contacts, updatedAt: serverTimestamp() }, { merge: true });
}

export async function setEventProductionLinks(eventId: string, links: ProductionLink[]): Promise<void> {
  await setDoc(eventProductionDoc(eventId), { links, updatedAt: serverTimestamp() }, { merge: true });
}
