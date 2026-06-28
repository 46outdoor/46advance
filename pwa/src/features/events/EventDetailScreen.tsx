import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { canEditEvent } from '@/lib/rbac/permissions';
import { getEventRole } from '@/lib/rbac/membership';
import { formatDateRange } from '@/lib/dates/formatting';
import type { EventInput, EventRecord } from '@/lib/events/event';
import { emptyLogo, type Logo } from '@/lib/branding/logo';
import { brandingKey, getBranding } from '@/lib/branding/branding-service';
import { LogoRow } from '@/components/branding/LogoRow';
import { LogoUploader } from '@/components/branding/LogoUploader';
import { listDepartments } from '@/lib/departments/departments-service';
import { savePacketToDrive, useGoogleConnection } from '@/lib/google';
import { generatePacket, getEventBySlugOrId, setEventLogo, updateEvent } from './events-service';
import { EventForm } from './EventForm';
import { EventStatusBadge } from './EventStatusBadge';
import { StagesPanel } from './StagesPanel';
import { EventContactsPanel } from './EventContactsPanel';
import { BookedCallsPanel } from './BookedCallsPanel';

const logger = createLogger('Events');

export function EventDetailScreen() {
  const { eventId } = useParams();
  const { user, isAdmin, isOrganizer } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const eventQuery = useQuery({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => getEventBySlugOrId(eventId!),
    enabled: !!eventId,
  });
  const event = eventQuery.data;
  // The route param may be a slug; resolve to the canonical doc id for writes + sub-links.
  const id = event?.id;

  const roleQuery = useQuery({
    queryKey: ['events', 'role', id, user?.uid],
    queryFn: () => getEventRole(user!.uid, id!),
    enabled: !!id && !!user,
  });

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: listDepartments });

  const brandingQuery = useQuery({ queryKey: brandingKey(), queryFn: getBranding });

  const update = useMutation({
    mutationFn: (input: EventInput) => updateEvent(id!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      setEditing(false);
    },
    onError: (err) => logger.error('Failed to update event', err),
  });

  const saveLogo = useMutation({
    mutationFn: (logo: Logo) => setEventLogo(id!, logo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventId] });
    },
    onError: (err) => logger.error('Failed to update event logo', err),
  });

  const connectionQuery = useGoogleConnection();

  const packet = useMutation({
    mutationFn: () => generatePacket(id!),
    onSuccess: ({ url }) => window.open(url, '_blank', 'noopener,noreferrer'),
    onError: (err) => logger.error('Failed to generate packet', err),
  });

  // Generate a fresh packet, then save it into the caller's Drive (Phase 13).
  const saveToDrive = useMutation({
    mutationFn: async () => {
      const { path } = await generatePacket(id!);
      return savePacketToDrive(id!, path);
    },
    onSuccess: (res) => {
      if (res.saved && res.webViewLink) window.open(res.webViewLink, '_blank', 'noopener,noreferrer');
    },
    onError: (err) => logger.error('Failed to save packet to Drive', err),
  });

  // Canonicalize the URL to the slug (upgrades id-based + just-created links).
  useEffect(() => {
    if (event?.slug && eventId && eventId !== event.slug) {
      navigate(`/events/${event.slug}`, { replace: true });
    }
  }, [event?.slug, eventId, navigate]);

  if (!user || !eventId) return null;

  const viewer = { uid: user.uid, isAdmin, isOrganizer };
  const canEdit = canEditEvent(viewer, roleQuery.data ?? null);
  const defaultLogos = brandingQuery.data?.defaultLogos ?? [];

  return (
    <section className="space-y-6">
      <Link to="/events" className="text-sm text-ink-muted hover:text-accent">
        ← Events
      </Link>

      {eventQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {eventQuery.isError && <p className="text-sm text-accent">Failed to load this event.</p>}
      {eventQuery.data === null && <p className="text-sm text-ink-muted">Event not found, or you don’t have access.</p>}

      {event && !editing && (
        <EventDetailHeader
          event={event}
          eventId={event.id}
          canEdit={canEdit}
          defaultLogos={defaultLogos}
          hasDrive={connectionQuery.data?.hasDrive ?? false}
          packetPending={packet.isPending}
          packetError={packet.isError}
          saveToDrivePending={saveToDrive.isPending}
          saveToDriveError={saveToDrive.isError}
          onGeneratePacket={() => packet.mutate()}
          onSaveToDrive={() => saveToDrive.mutate()}
          onEdit={() => setEditing(true)}
        />
      )}

      {event && editing && (
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
            <h2 className="mb-3 font-display text-lg font-bold text-brand">Edit event</h2>
            <EventForm
              initial={event}
              departments={departmentsQuery.data ?? []}
              submitLabel="Save changes"
              showStatus
              pending={update.isPending}
              error={update.isError ? 'Could not save changes.' : null}
              onSubmit={(input) => update.mutate(input)}
              onCancel={() => setEditing(false)}
            />
          </div>
          <EventLogoCard
            logo={event.eventLogo ?? emptyLogo()}
            defaultLogos={defaultLogos}
            eventId={event.id}
            pending={saveLogo.isPending}
            error={saveLogo.isError}
            onChange={(logo) => saveLogo.mutate(logo)}
          />
        </div>
      )}

      {event && <BookedCallsPanel eventId={event.id} canEdit={canEdit} />}

      {event && <StagesPanel eventId={event.id} canEdit={canEdit} />}

      {event && <EventContactsPanel eventId={event.id} uid={user.uid} canEdit={canEdit} />}
    </section>
  );
}

interface EventDetailHeaderProps {
  event: EventRecord;
  eventId: string;
  canEdit: boolean;
  defaultLogos: Logo[];
  hasDrive: boolean;
  packetPending: boolean;
  packetError: boolean;
  saveToDrivePending: boolean;
  saveToDriveError: boolean;
  onGeneratePacket: () => void;
  onSaveToDrive: () => void;
  onEdit: () => void;
}

function EventDetailHeader({
  event,
  eventId,
  canEdit,
  defaultLogos,
  hasDrive,
  packetPending,
  packetError,
  saveToDrivePending,
  saveToDriveError,
  onGeneratePacket,
  onSaveToDrive,
  onEdit,
}: EventDetailHeaderProps) {
  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-black tracking-tight text-brand">{event.name}</h1>
          <EventStatusBadge status={event.status} />
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/events/${eventId}/production`}
            className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
          >
            Production
          </Link>
          <Link
            to={`/events/${eventId}/schedule`}
            className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
          >
            Schedule
          </Link>
          <Link
            to={`/tracker/${eventId}`}
            className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
          >
            Tracker
          </Link>
          <button
            type="button"
            onClick={onGeneratePacket}
            disabled={packetPending}
            className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {packetPending ? 'Generating…' : 'Generate packet'}
          </button>
          {hasDrive && (
            <button
              type="button"
              onClick={onSaveToDrive}
              disabled={saveToDrivePending}
              className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {saveToDrivePending ? 'Saving…' : 'Save packet to Drive'}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
            >
              Edit
            </button>
          )}
        </div>
      </div>
      <p className="text-ink-muted">{formatDateRange(event.startDate, event.endDate)}</p>
      {event.venue && <p className="text-ink-muted">{event.venue}</p>}
      <LogoRow eventLogo={event.eventLogo} defaults={defaultLogos} className="pt-1" />
      {packetError && <p className="text-sm text-accent">Could not generate the packet. Try again.</p>}
      {saveToDriveError && <p className="text-sm text-accent">Could not save the packet to Drive.</p>}
    </header>
  );
}

interface EventLogoCardProps {
  logo: Logo;
  defaultLogos: Logo[];
  eventId: string;
  pending: boolean;
  error: boolean;
  onChange: (logo: Logo) => void;
}

/** PM/admin-only per-event logo override. Falls back to the shared defaults when empty. */
function EventLogoCard({ logo, defaultLogos, eventId, pending, error, onChange }: EventLogoCardProps) {
  return (
    <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-brand">Logo</h2>
        {pending && <span className="text-xs text-ink-muted">Saving…</span>}
      </div>
      <p className="mb-3 text-sm text-ink-muted">
        Override this show’s logo. Leave empty to use the shared default marks.
      </p>
      <LogoRow eventLogo={logo} defaults={defaultLogos} className="mb-4" />
      <LogoUploader
        logo={logo}
        pathPrefix={`events/${eventId}/logo`}
        onChange={onChange}
        disabled={pending}
      />
      {error && <p className="mt-2 text-sm text-accent">Could not save the logo. Try again.</p>}
    </div>
  );
}
