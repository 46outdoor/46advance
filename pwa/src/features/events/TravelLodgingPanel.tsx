/**
 * Travel & Lodging panel (planning/archive/feature/CREW_TRAVEL_LODGING_PLAN.md §4.4): per-person lodging and
 * travel records for the event's crew. Three views from two predicates:
 * - canManageCrewLogistics → every record, grouped by person, with add/edit/delete;
 * - canViewAllCrewLogistics only (production director) → the same grouping, read-only;
 * - otherwise → the viewer's OWN records via the uid-constrained query (the list-query
 *   trap, §4.3), read-only, and the panel renders nothing at all when they have none.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { describeCallableError } from '@/lib/errors/callableError';
import { formatDateKey } from '@/lib/dates/formatting';
import {
  APP_TIME_ZONE,
  dateToZonedInput,
  formatZonedDateTime,
  zonedInputToDate,
} from '@/lib/dates/timezone';
import {
  canManageCrewLogistics,
  canViewAllCrewLogistics,
  type Viewer,
} from '@/lib/rbac/permissions';
import type { EventRole } from '@/lib/rbac/roles';
import {
  crewLogisticsInputSchema,
  TRAVEL_MODES,
  TRAVEL_MODE_LABELS,
  type CrewLogisticsInput,
  type CrewLogisticsKind,
  type CrewLogisticsRecord,
  type TravelMode,
} from '@/lib/logistics/crewLogistics';
import {
  createCrewLogistics,
  crewLogisticsKey,
  deleteCrewLogistics,
  listCrewLogistics,
  updateCrewLogistics,
} from './crew-logistics-service';
import { listEventContacts, type ResolvedEventContact } from './event-contacts-service';

const logger = createLogger('TravelLodgingPanel');

/** Offered zones (any IANA zone is valid in the model; these cover the touring footprint). */
const ZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
] as const;

const inputClass =
  'min-h-11 w-full rounded border border-line bg-transparent px-2 py-1.5 text-sm focus:border-accent focus:outline-none sm:min-h-0';
const buttonClass =
  'min-h-11 rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0';

interface TravelLodgingPanelProps {
  eventId: string;
  viewer: Viewer;
  role: EventRole | null;
}

export function TravelLodgingPanel({ eventId, viewer, role }: TravelLodgingPanelProps) {
  const canManage = canManageCrewLogistics(viewer, role);
  const canViewAll = canViewAllCrewLogistics(viewer, role);
  const scope = canViewAll ? 'all' : 'self';
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ record: CrewLogisticsRecord | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recordsQuery = useQuery({
    queryKey: crewLogisticsKey(eventId, scope),
    queryFn: () => listCrewLogistics(eventId, viewer.uid, canViewAll),
  });
  // Roster names for grouping; member-readable, so every audience of this panel may fetch it.
  const rosterQuery = useQuery({
    queryKey: ['event-contacts', eventId],
    queryFn: () => listEventContacts(eventId),
    enabled: canViewAll,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['events', 'crewLogistics', eventId] });

  const removeMutation = useMutation({
    mutationFn: (recordId: string) => deleteCrewLogistics(eventId, recordId),
    onSuccess: invalidate,
    onError: (err) => setError(describeCallableError(err)),
  });

  const records = recordsQuery.data ?? [];
  // Crew with nothing booked see no panel at all — not an empty shell. Null during the
  // pending state too (no flash), but NOT on error: a crew member whose query failed must
  // see the failure, not silence.
  if (!canViewAll && !recordsQuery.isError && records.length === 0) return null;

  const byPerson = new Map<string, CrewLogisticsRecord[]>();
  for (const r of records) {
    const list = byPerson.get(r.eventContactId) ?? [];
    list.push(r);
    byPerson.set(r.eventContactId, list);
  }
  const roster = rosterQuery.data ?? [];
  const nameOf = (attachId: string): string =>
    roster.find((c) => c.attachment.id === attachId)?.contact?.name ?? 'Former crew member';

  return (
    // aria-label makes this a named region landmark: screen-reader navigable, and the
    // E2E spec scopes to it without a test id.
    <section aria-label="Travel and lodging" className="rounded border border-line p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-black tracking-tight">Travel &amp; Lodging</h2>
        {canManage && !editing && (
          <button
            type="button"
            className={buttonClass}
            onClick={() => setEditing({ record: null })}
          >
            Add record
          </button>
        )}
      </header>

      {recordsQuery.isLoading && <p className="mt-2 text-sm text-ink-muted">Loading…</p>}
      {recordsQuery.isError && (
        <p className="mt-2 text-sm text-accent">Failed to load travel &amp; lodging.</p>
      )}
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}

      {editing && (
        <RecordForm
          eventId={eventId}
          viewerUid={viewer.uid}
          roster={roster}
          record={editing.record}
          onDone={() => {
            setEditing(null);
            setError(null);
            void invalidate();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {canViewAll ? (
        <div className="mt-3 space-y-4">
          {byPerson.size === 0 && !recordsQuery.isLoading && (
            <p className="text-sm text-ink-muted">No travel or lodging recorded yet.</p>
          )}
          {[...byPerson.entries()].map(([attachId, personRecords]) => (
            <div key={attachId}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                {nameOf(attachId)}
              </h3>
              <ul className="mt-1 space-y-2">
                {personRecords.map((r) => (
                  <RecordRow
                    key={r.id}
                    record={r}
                    canManage={canManage}
                    onEdit={() => setEditing({ record: r })}
                    onDelete={() => removeMutation.mutate(r.id)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {records.map((r) => (
            <RecordRow key={r.id} record={r} canManage={false} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecordRow({
  record,
  canManage,
  onEdit,
  onDelete,
}: {
  record: CrewLogisticsRecord;
  canManage: boolean;
  /** Only rendered when canManage — the read-only views omit them. */
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 rounded border border-line p-3">
      <div className="min-w-0 text-sm">
        {record.kind === 'lodging' ? (
          <>
            <p className="font-semibold">{record.hotelName}</p>
            <p className="text-ink-muted">
              {formatDateKey(record.checkInDate)} → {formatDateKey(record.checkOutDate)}
              {record.roomType ? ` · ${record.roomType}` : ''}
              {record.roomNumber ? ` · Room ${record.roomNumber}` : ''}
            </p>
            {record.confirmation && <p className="text-ink-muted">Conf # {record.confirmation}</p>}
          </>
        ) : (
          <>
            <p className="font-semibold">
              {TRAVEL_MODE_LABELS[record.mode]}
              {record.carrier ? ` · ${record.carrier}` : ''}
              {record.confirmation ? ` · ${record.confirmation}` : ''}
            </p>
            <p className="text-ink-muted">
              {record.from ?? '—'} → {record.to ?? '—'}
            </p>
            {record.departAt && (
              <p className="text-ink-muted">
                Departs{' '}
                {formatZonedDateTime(record.departAt, record.departTimeZone ?? APP_TIME_ZONE)}
              </p>
            )}
            {record.arriveAt && (
              <p className="text-ink-muted">
                Arrives{' '}
                {formatZonedDateTime(record.arriveAt, record.arriveTimeZone ?? APP_TIME_ZONE)}
              </p>
            )}
          </>
        )}
        {record.notes && <p className="mt-1 text-ink-muted">{record.notes}</p>}
      </div>
      {canManage && (
        <div className="flex gap-2">
          <button type="button" className={buttonClass} onClick={onEdit}>
            Edit
          </button>
          <button type="button" className={buttonClass} onClick={onDelete}>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

interface RecordFormProps {
  eventId: string;
  viewerUid: string;
  roster: ResolvedEventContact[];
  /** null = creating a new record. */
  record: CrewLogisticsRecord | null;
  onDone: () => void;
  onCancel: () => void;
}

function RecordForm({ eventId, viewerUid, roster, record, onDone, onCancel }: RecordFormProps) {
  const [kind, setKind] = useState<CrewLogisticsKind>(record?.kind ?? 'lodging');
  const [attachId, setAttachId] = useState(record?.eventContactId ?? '');
  const [fields, setFields] = useState<Record<string, string>>(() => initialFields(record));
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input = buildInput(kind, fields);
      if (!attachId) throw new Error('Pick a crew member.');
      if (record) await updateCrewLogistics(eventId, record.id, attachId, input, record.kind);
      else await createCrewLogistics(eventId, attachId, input, viewerUid);
    },
    onSuccess: onDone,
    onError: (err) => {
      logger.error('save failed', err);
      setError(err instanceof Error ? err.message : describeCallableError(err));
    },
  });

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form
      className="mt-3 space-y-3 rounded border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink-muted">Crew member</span>
          <select
            className={inputClass}
            value={attachId}
            onChange={(e) => setAttachId(e.target.value)}
            disabled={record !== null}
          >
            <option value="">Select…</option>
            {roster.map((c) => (
              <option key={c.attachment.id} value={c.attachment.id}>
                {c.contact?.name ?? 'Unknown contact'}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-muted">Type</span>
          <select
            className={inputClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as CrewLogisticsKind)}
            disabled={record !== null}
          >
            <option value="lodging">Lodging</option>
            <option value="travel">Travel</option>
          </select>
        </label>
      </div>

      {kind === 'lodging' ? (
        <LodgingFields fields={fields} set={set} />
      ) : (
        <TravelFields fields={fields} set={set} />
      )}

      <label className="block text-sm">
        <span className="text-ink-muted">Notes</span>
        <input className={inputClass} value={fields.notes ?? ''} onChange={set('notes')} />
      </label>

      {error && <p className="text-sm text-accent">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={saveMutation.isPending}>
          {record ? 'Save changes' : 'Add'}
        </button>
        <button type="button" className={buttonClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function LodgingFields({
  fields,
  set,
}: {
  fields: Record<string, string>;
  set: (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Hotel name" value={fields.hotelName ?? ''} onChange={set('hotelName')} />
      <Field label="Address" value={fields.address ?? ''} onChange={set('address')} />
      <Field label="Hotel phone" value={fields.hotelPhone ?? ''} onChange={set('hotelPhone')} />
      <Field
        label="Confirmation #"
        value={fields.confirmation ?? ''}
        onChange={set('confirmation')}
      />
      <Field
        label="Check-in"
        type="date"
        value={fields.checkInDate ?? ''}
        onChange={set('checkInDate')}
      />
      <Field
        label="Check-out"
        type="date"
        value={fields.checkOutDate ?? ''}
        onChange={set('checkOutDate')}
      />
      <Field label="Room type" value={fields.roomType ?? ''} onChange={set('roomType')} />
      <Field label="Room #" value={fields.roomNumber ?? ''} onChange={set('roomNumber')} />
    </div>
  );
}

function TravelFields({
  fields,
  set,
}: {
  fields: Record<string, string>;
  set: (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="text-ink-muted">Mode</span>
        <select className={inputClass} value={fields.mode ?? 'flight'} onChange={set('mode')}>
          {TRAVEL_MODES.map((m) => (
            <option key={m} value={m}>
              {TRAVEL_MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      <Field label="Carrier" value={fields.carrier ?? ''} onChange={set('carrier')} />
      <Field
        label="Flight / Conf #"
        value={fields.confirmation ?? ''}
        onChange={set('confirmation')}
      />
      <Field label="From" value={fields.from ?? ''} onChange={set('from')} />
      <Field label="To" value={fields.to ?? ''} onChange={set('to')} />
      <Field
        label="Departs"
        type="datetime-local"
        value={fields.departAt ?? ''}
        onChange={set('departAt')}
      />
      <ZoneField
        label="Departure zone"
        value={fields.departTimeZone ?? APP_TIME_ZONE}
        onChange={set('departTimeZone')}
      />
      <Field
        label="Arrives"
        type="datetime-local"
        value={fields.arriveAt ?? ''}
        onChange={set('arriveAt')}
      />
      <ZoneField
        label="Arrival zone"
        value={fields.arriveTimeZone ?? APP_TIME_ZONE}
        onChange={set('arriveTimeZone')}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-ink-muted">{label}</span>
      <input className={inputClass} type={type} value={value} onChange={onChange} />
    </label>
  );
}

function ZoneField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-ink-muted">{label}</span>
      <select className={inputClass} value={value} onChange={onChange}>
        {ZONE_OPTIONS.map((z) => (
          <option key={z} value={z}>
            {z.replace('America/', '').replace('_', ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Record → flat editable strings (instants rendered in their stored zone). */
function initialFields(record: CrewLogisticsRecord | null): Record<string, string> {
  if (!record) return {};
  if (record.kind === 'lodging') {
    return {
      hotelName: record.hotelName,
      address: record.address ?? '',
      hotelPhone: record.hotelPhone ?? '',
      confirmation: record.confirmation ?? '',
      checkInDate: record.checkInDate,
      checkOutDate: record.checkOutDate,
      roomType: record.roomType ?? '',
      roomNumber: record.roomNumber ?? '',
      notes: record.notes ?? '',
    };
  }
  return {
    mode: record.mode,
    carrier: record.carrier ?? '',
    confirmation: record.confirmation ?? '',
    from: record.from ?? '',
    to: record.to ?? '',
    departAt: dateToZonedInput(record.departAt, record.departTimeZone ?? APP_TIME_ZONE),
    arriveAt: dateToZonedInput(record.arriveAt, record.arriveTimeZone ?? APP_TIME_ZONE),
    departTimeZone: record.departTimeZone ?? APP_TIME_ZONE,
    arriveTimeZone: record.arriveTimeZone ?? APP_TIME_ZONE,
    notes: record.notes ?? '',
  };
}

/** '' → null for optional text fields. */
const orNull = (v: string | undefined): string | null => v || null;

function rawLodging(f: Record<string, string>) {
  return {
    kind: 'lodging' as const,
    hotelName: f.hotelName ?? '',
    address: orNull(f.address),
    hotelPhone: orNull(f.hotelPhone),
    confirmation: orNull(f.confirmation),
    checkInDate: f.checkInDate ?? '',
    checkOutDate: f.checkOutDate ?? '',
    roomType: orNull(f.roomType),
    roomNumber: orNull(f.roomNumber),
    notes: orNull(f.notes),
  };
}

function rawTravel(f: Record<string, string>) {
  const departZone = f.departTimeZone || APP_TIME_ZONE;
  const arriveZone = f.arriveTimeZone || APP_TIME_ZONE;
  return {
    kind: 'travel' as const,
    mode: (f.mode ?? 'flight') as TravelMode,
    carrier: orNull(f.carrier),
    confirmation: orNull(f.confirmation),
    from: orNull(f.from),
    to: orNull(f.to),
    departAt: f.departAt ? zonedInputToDate(f.departAt, departZone) : null,
    arriveAt: f.arriveAt ? zonedInputToDate(f.arriveAt, arriveZone) : null,
    departTimeZone: f.departAt ? departZone : null,
    arriveTimeZone: f.arriveAt ? arriveZone : null,
    notes: orNull(f.notes),
  };
}

/** Flat form strings → validated input; throws the first validation message. */
function buildInput(kind: CrewLogisticsKind, f: Record<string, string>): CrewLogisticsInput {
  const raw = kind === 'lodging' ? rawLodging(f) : rawTravel(f);
  const parsed = crewLogisticsInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Check the highlighted fields.');
  }
  return parsed.data;
}
