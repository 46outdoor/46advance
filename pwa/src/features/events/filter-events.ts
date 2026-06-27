import type { EventRecord, EventStatus } from '@/lib/events/event';

/** Status selection for the events list: a concrete status or "all". */
export type EventStatusFilter = 'all' | EventStatus;

/**
 * Client-side filtering for the already-loaded events list. Composes a status
 * filter with a free-text search so both apply together. Search is
 * case-insensitive, trimmed, and matches the event name and venue (the fields
 * surfaced on the list card). Empty/whitespace search matches everything.
 */
export function filterEvents(
  events: readonly EventRecord[],
  statusFilter: EventStatusFilter,
  search: string,
): EventRecord[] {
  const query = search.trim().toLowerCase();
  return events.filter((event) => {
    if (statusFilter !== 'all' && event.status !== statusFilter) return false;
    if (query === '') return true;
    return matchesEvent(event, query);
  });
}

/** True when the lowercased query appears in any searchable field of the event. */
function matchesEvent(event: EventRecord, query: string): boolean {
  const haystacks = [event.name, event.venue];
  return haystacks.some((value) => value != null && value.toLowerCase().includes(query));
}
