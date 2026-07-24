import { describe, it, expect } from 'vitest';
import type { EventRecord, EventStatus } from '@/lib/events/event';
import { filterEvents } from './filter-events';

function makeEvent(overrides: Partial<EventRecord> & { id: string }): EventRecord {
  return {
    id: overrides.id,
    name: overrides.name ?? 'Event',
    startDate: overrides.startDate ?? null,
    endDate: overrides.endDate ?? null,
    loadInDays: overrides.loadInDays ?? 0,
    loadOutDays: overrides.loadOutDays ?? 0,
    timeZone: overrides.timeZone ?? 'America/Chicago',
    venue: overrides.venue ?? null,
    shortCode: overrides.shortCode ?? null,
    festivalId: overrides.festivalId ?? null,
    location: overrides.location ?? null,
    driveFolderId: overrides.driveFolderId ?? null,
    driveFolderName: overrides.driveFolderName ?? null,
    packetDrive: overrides.packetDrive ?? null,
    status: overrides.status ?? 'active',
    departmentIds: overrides.departmentIds ?? [],
    googleCalendarId: overrides.googleCalendarId ?? null,
    bookingLabel: overrides.bookingLabel ?? null,
    slug: overrides.slug ?? null,
    eventLogo: overrides.eventLogo ?? null,
    createdBy: overrides.createdBy ?? 'uid',
    createdAt: overrides.createdAt ?? null,
    updatedAt: overrides.updatedAt ?? null,
  };
}

const events: EventRecord[] = [
  makeEvent({ id: '1', name: 'Summerfest 2026', venue: 'Riverside Park', status: 'active' }),
  makeEvent({ id: '2', name: 'Winter Jam', venue: 'Downtown Arena', status: 'draft' }),
  makeEvent({ id: '3', name: 'Riverside Acoustic', venue: 'The Barn', status: 'active' }),
  makeEvent({ id: '4', name: 'Archived Bash', venue: null, status: 'archived' }),
];

const ids = (records: EventRecord[]): string[] => records.map((r) => r.id);

describe('filterEvents', () => {
  it('returns everything when status is "all" and search is empty', () => {
    expect(ids(filterEvents(events, 'all', ''))).toEqual(['1', '2', '3', '4']);
  });

  it('narrows results by name (case-insensitive, trimmed)', () => {
    expect(ids(filterEvents(events, 'all', '  summer  '))).toEqual(['1']);
  });

  it('matches the venue field as well as the name', () => {
    // "riverside" is a name on #3 and a venue on #1 — both should match.
    expect(ids(filterEvents(events, 'all', 'riverside'))).toEqual(['1', '3']);
  });

  it('composes search and status filter (both apply together)', () => {
    // "riverside" matches #1 and #3, but only #3 is active AND draft is excluded.
    expect(ids(filterEvents(events, 'active', 'riverside'))).toEqual(['1', '3']);
    // Same search constrained to draft yields nothing (none of the matches are draft).
    expect(ids(filterEvents(events, 'draft', 'riverside'))).toEqual([]);
  });

  it('applies the status filter on its own', () => {
    expect(ids(filterEvents(events, 'draft', ''))).toEqual(['2']);
  });

  it('returns an empty list when nothing matches (empty-result state)', () => {
    expect(filterEvents(events, 'all', 'no-such-event')).toEqual([]);
    expect(filterEvents(events, 'archived', 'summer')).toEqual([]);
  });

  it('ignores a null venue without throwing', () => {
    expect(ids(filterEvents(events, 'all', 'bash'))).toEqual(['4']);
  });

  type StatusCase = EventStatus;
  it('keeps only the requested status when searching across statuses', () => {
    const status: StatusCase = 'active';
    expect(ids(filterEvents(events, status, ''))).toEqual(['1', '3']);
  });
});
