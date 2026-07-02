import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getEventBySlugOrId } from './events-service';
import type { EventRecord } from '@/lib/events/event';

/**
 * Resolve a route param — which may be a readable slug OR a raw doc id — to the canonical event.
 *
 * Every event screen uses this so that:
 *  - slug deep-links / refreshes work everywhere (not just the event detail screen), and
 *  - all sub-queries (role, stages, advances, schedule, production…) key on the canonical
 *    `event.id`, never the ambiguous route param.
 *
 * The detail query is keyed on the raw param with this ONE resolving fetcher, so the
 * `['events','detail', param]` cache entry is always produced the same way (no stale/duplicate
 * fetcher writing the same key with a raw-id lookup that 404s on a slug). Returns the resolved
 * `eventId` (doc id) — null until the lookup resolves; gate sub-queries on it.
 */
export function useResolvedEvent(param: string | undefined): {
  query: UseQueryResult<EventRecord | null>;
  event: EventRecord | null;
  eventId: string | null;
} {
  const query = useQuery({
    queryKey: ['events', 'detail', param],
    queryFn: () => getEventBySlugOrId(param!),
    enabled: !!param,
  });
  return { query, event: query.data ?? null, eventId: query.data?.id ?? null };
}
