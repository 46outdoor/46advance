/**
 * Shared React Query hook for the caller's cross-event membership summary.
 *
 * One hook, one query key, one Firestore read: AppShell (the Tracker nav gate), the Events
 * list, the Tracker overview and the Calendar Feed picker all mount this and React Query
 * dedupes them into a single `collectionGroup('members')` request.
 *
 * Treat `data` as a TRI-STATE — `undefined` while it resolves. Feed it through
 * `isProductionManagerSomewhere()` into `canViewTracker()` rather than defaulting it to `[]`,
 * or the Tracker link flashes in and out as the query settles.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import {
  listMyEventMemberships,
  myEventMembershipsKey,
  type MyEventMembership,
} from './my-memberships';

export function useMyEventMemberships() {
  const { user } = useAuth();
  return useQuery<MyEventMembership[]>({
    queryKey: myEventMembershipsKey(user?.uid),
    queryFn: () => listMyEventMemberships(user!.uid),
    enabled: !!user,
  });
}
