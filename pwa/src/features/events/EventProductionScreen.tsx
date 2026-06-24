import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { canEditEvent } from '@/lib/rbac/permissions';
import { getEventRole } from '@/lib/rbac/membership';
import { EVENT_PRODUCTION_FIELDS, type SectionContent } from '@/lib/advances/fields';
import type { ProductionContact, ProductionLink } from '@/lib/production/production';
import {
  getEventProduction,
  setEventProductionContacts,
  setEventProductionInfo,
  setEventProductionLinks,
} from './production-service';
import { SectionContentForm } from './SectionContentForm';
import { ProductionContactsEditor } from './ProductionContactsEditor';
import { ProductionLinksEditor } from './ProductionLinksEditor';

const logger = createLogger('Production');

/** Event-level production record: tech-operational info + contacts + links. */
export function EventProductionScreen() {
  const { eventId } = useParams();
  const { user, isAdmin, isOrganizer } = useAuth();
  const queryClient = useQueryClient();

  const productionQuery = useQuery({
    queryKey: ['production', eventId],
    queryFn: () => getEventProduction(eventId!),
    enabled: !!eventId,
  });

  const roleQuery = useQuery({
    queryKey: ['events', 'role', eventId, user?.uid],
    queryFn: () => getEventRole(user!.uid, eventId!),
    enabled: !!eventId && !!user,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['production', eventId] });

  const saveInfo = useMutation({
    mutationFn: (info: SectionContent) => setEventProductionInfo(eventId!, info),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to save production info', err),
  });
  const saveContacts = useMutation({
    mutationFn: (contacts: ProductionContact[]) => setEventProductionContacts(eventId!, contacts),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to save production contacts', err),
  });
  const saveLinks = useMutation({
    mutationFn: (links: ProductionLink[]) => setEventProductionLinks(eventId!, links),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to save production links', err),
  });

  if (!user || !eventId) return null;

  const viewer = { uid: user.uid, isAdmin, isOrganizer };
  const canEdit = canEditEvent(viewer, roleQuery.data ?? null);
  const production = productionQuery.data;

  return (
    <section className="space-y-6">
      <Link to={`/events/${eventId}`} className="text-sm text-ink-muted hover:text-accent">
        ← Event
      </Link>
      <h1 className="font-display text-3xl font-black tracking-tight text-brand">Festival production</h1>
      <p className="text-sm text-ink-muted">
        Event-wide production info for the crew (per-stage technical specs live on each stage).
      </p>

      {productionQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {productionQuery.isError && <p className="text-sm text-accent">Failed to load production.</p>}

      {production && (
        <>
          <div className="space-y-3 border-t border-line pt-5">
            <h2 className="font-display text-xl font-bold text-brand">Site / production info</h2>
            <SectionContentForm
              fields={EVENT_PRODUCTION_FIELDS}
              initial={production.info}
              readOnly={!canEdit}
              pending={saveInfo.isPending}
              onSave={(info) => saveInfo.mutate(info)}
            />
          </div>

          <div className="space-y-3 border-t border-line pt-5">
            <h2 className="font-display text-xl font-bold text-brand">Production contacts</h2>
            <ProductionContactsEditor
              initial={production.contacts}
              readOnly={!canEdit}
              pending={saveContacts.isPending}
              onSave={(c) => saveContacts.mutate(c)}
            />
          </div>

          <div className="space-y-3 border-t border-line pt-5">
            <h2 className="font-display text-xl font-bold text-brand">Reference links (CAD / Drive / plots)</h2>
            <ProductionLinksEditor
              initial={production.links}
              readOnly={!canEdit}
              pending={saveLinks.isPending}
              onSave={(l) => saveLinks.mutate(l)}
            />
          </div>
        </>
      )}
    </section>
  );
}
