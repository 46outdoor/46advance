/**
 * Tracker data access (ROADMAP §8). Shared lib (the tracker feature can't import the
 * events feature's services — no-cross-feature), so this reads Firestore directly via the
 * @/lib models, mirroring @/lib/rbac/membership.ts. Reads are member-gated by
 * firestore.rules; no writes. Pure aggregation lives in tracker.ts.
 */
import { collection, collectionGroup, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { parseEvent, type EventRecord } from '@/lib/events/event';
import { parseStage } from '@/lib/events/stage';
import { parseAdvance } from '@/lib/advances/advance';
import { parseDepartment } from '@/lib/departments/department';
import type { Viewer } from '@/lib/rbac/permissions';
import {
  completionPct,
  rollUpEvent,
  sumCounts,
  type EventTracker,
  type LocatedAdvance,
  type StatusCounts,
  type TrackerColumn,
} from './tracker';

/** One event's line in the overview: its details + completion roll-up. */
export interface EventTrackerSummary {
  event: EventRecord;
  counts: StatusCounts;
  pct: number;
  advanceCount: number;
}

/** The drill-in view: the event header + its grid. */
export interface EventTrackerView {
  event: EventRecord;
  tracker: EventTracker;
}

/** Department id → display name, for resolving grid columns. */
async function loadDepartmentNames(): Promise<Map<string, string>> {
  const snap = await getDocs(collection(db, 'departments'));
  return new Map(snap.docs.map((d) => [d.id, parseDepartment(d.id, d.data()).name]));
}

/** Resolve an event's enabled departments into ordered grid columns. */
function eventColumns(event: EventRecord, deptNames: Map<string, string>): TrackerColumn[] {
  return event.departmentIds.map((id) => ({ id, name: deptNames.get(id) ?? id }));
}

/** Read every located advance for an event (stages → advances), ordered by stage. */
async function loadLocatedAdvances(eventId: string): Promise<LocatedAdvance[]> {
  const stageSnap = await getDocs(collection(db, 'events', eventId, 'stages'));
  const stages = stageSnap.docs
    .map((d) => parseStage(d.id, d.data()))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const perStage = await Promise.all(
    stages.map(async (stage) => {
      const advSnap = await getDocs(collection(db, 'events', eventId, 'stages', stage.id, 'advances'));
      return advSnap.docs.map((d) => ({
        stageId: stage.id,
        stageName: stage.name,
        advance: parseAdvance(d.id, d.data()),
      }));
    }),
  );
  return perStage.flat();
}

/** Full per-event grid: event header + columns (departments) × rows (advances). */
export async function getEventTracker(eventId: string): Promise<EventTrackerView | null> {
  const eventSnap = await getDoc(doc(db, 'events', eventId));
  if (!eventSnap.exists()) return null;
  const event = parseEvent(eventSnap.id, eventSnap.data());

  const [deptNames, located] = await Promise.all([loadDepartmentNames(), loadLocatedAdvances(eventId)]);
  return { event, tracker: rollUpEvent(located, eventColumns(event, deptNames)) };
}

/** The events visible to the viewer (admin = all; otherwise membership-scoped). */
async function listVisibleEvents(viewer: Viewer): Promise<EventRecord[]> {
  if (viewer.isAdmin) {
    const snap = await getDocs(collection(db, 'events'));
    return snap.docs.map((d) => parseEvent(d.id, d.data()));
  }
  const memberSnap = await getDocs(
    query(collectionGroup(db, 'members'), where('uid', '==', viewer.uid)),
  );
  const eventIds = [
    ...new Set(
      memberSnap.docs
        .map((d) => d.ref.parent.parent?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const events = await Promise.all(
    eventIds.map(async (id) => {
      const snap = await getDoc(doc(db, 'events', id));
      return snap.exists() ? parseEvent(snap.id, snap.data()) : null;
    }),
  );
  return events.filter((e): e is EventRecord => e !== null);
}

/** Overview: each visible event with its completion roll-up, sorted by name. */
export async function listEventTrackerSummaries(viewer: Viewer): Promise<EventTrackerSummary[]> {
  const events = await listVisibleEvents(viewer);
  const summaries = await Promise.all(
    events.map(async (event) => {
      const located = await loadLocatedAdvances(event.id);
      const counts = sumCounts(
        located.map((l) => {
          const c: StatusCounts = { not_started: 0, in_progress: 0, complete: 0, total: 0 };
          for (const deptId of event.departmentIds) {
            const status = l.advance.sections[deptId]?.status;
            if (status) {
              c[status] += 1;
              c.total += 1;
            }
          }
          return c;
        }),
      );
      return { event, counts, pct: completionPct(counts), advanceCount: located.length };
    }),
  );
  return summaries.sort((a, b) => a.event.name.localeCompare(b.event.name));
}
