/**
 * Event schedule (redesign PR 2, planning/archive/feature/SCHEDULE_REDESIGN.md): day-container cards on
 * a shared grid — Start | End | Duration | Type | Item | Description — with a
 * URL-persisted filter bar (day / type / stage), the visible-type color key, an
 * MPA-style global Edit toggle with inline row editing (save on focus-leave), fully
 * manual days (add / edit / re-date / delete), and a bulk "shift all days ±N" action.
 * `{artist N}` placeholders resolve to the artist holding that lineup slot on the
 * item's stage. Calendar reconcile for pushToCalendar items lands with PR 4.
 */
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { canEditEvent } from '@/lib/rbac/permissions';
import { getEventRole } from '@/lib/rbac/membership';
import { formatDateKey } from '@/lib/dates/formatting';
import { dateInputValue } from '@/lib/dates/parsing';
import { APP_TIME_ZONE } from '@/lib/dates/timezone';
import { SCHEDULE_ITEM_TYPES } from '@/lib/schedules/itemTypes';
import {
  resolveArtistPlaceholders,
  type ScheduleDay,
  type ScheduleDayItem,
} from '@/lib/schedules/scheduleDay';
import { crewTypesKey, getCrewTypes } from '@/lib/schedules/crew-types-service';
import { buildSlotArtistLookup } from '@/lib/advances/lineup';
import { listEventAdvances } from '@/lib/tracker/tracker-service';
import { ScheduleDayCard, type ResolveItemText } from '@/components/schedules/ScheduleDayCard';
import { ScheduleTypeLegend } from '@/components/schedules/ScheduleTypeDot';
import type { StageOption } from '@/components/schedules/ScheduleItemRowEditor';
import { listStages } from './stages-service';
import { useResolvedEvent } from './useResolvedEvent';
import { ImportScheduleTemplatePanel } from './ImportScheduleTemplatePanel';
import { ScheduleDayForm } from './ScheduleDayForm';
import type { ScheduleDayMeta } from '@/lib/schedules/scheduleDay';
import { useGoogleConnection } from '@/lib/google';
import {
  createScheduleDay,
  dayToInput,
  deleteScheduleDay,
  listScheduleDays,
  reconcileScheduleDayCalendar,
  removeScheduleCalendarEvent,
  saveScheduleDay,
  saveScheduleDayMeta,
  shiftScheduleDays,
} from './schedule-days-service';

const logger = createLogger('Schedule');

function blankItem(): ScheduleDayItem {
  return {
    id: crypto.randomUUID(),
    type: 'production',
    customLabel: null,
    startTime: null,
    endTime: null,
    endEstimated: false,
    nextDay: false,
    item: 'New item',
    description: null,
    stageId: null,
    fields: {},
    crew: [],
    pushToCalendar: true,
    googleCalendarEventId: null,
  };
}

/** Row predicate for the type/stage filters ('' = no filter). */
function makeItemFilter(type: string, stage: string) {
  return (item: ScheduleDayItem) => (!type || item.type === type) && (!stage || item.stageId === stage);
}

/** All schedule-day mutations, invalidating the day list on success. Saves also fire a
 * fire-and-forget calendar reconcile for the affected day (PR 4) — a graceful no-op
 * when the caller hasn't connected Google. */
function useScheduleDayMutations(eventId: string | null, uid: string | undefined, onDaySettled: () => void) {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['scheduleDays', eventId] });
  const onError = (what: string) => (e: unknown) => logger.error(`Failed to ${what}`, e);
  const syncDay = (dayId: string) => {
    void reconcileScheduleDayCalendar(eventId!, dayId)
      .then((r) => {
        if (r.synced) invalidate(); // calendar ids were written back
      })
      .catch((e) => logger.error('Calendar sync failed', e));
  };

  const createDay = useMutation({
    mutationFn: (meta: ScheduleDayMeta) => createScheduleDay(eventId!, meta, uid!),
    onSuccess: () => {
      invalidate();
      onDaySettled();
    },
    onError: onError('add the day'),
  });
  const editDay = useMutation({
    // Atomic in the service: a date change re-keys and applies the metadata in one batch.
    mutationFn: ({ day, meta }: { day: ScheduleDay; meta: ScheduleDayMeta }) =>
      saveScheduleDayMeta(eventId!, day, meta, uid!),
    onSuccess: (dayId) => {
      invalidate();
      onDaySettled();
      // A date change moved every item's instant — re-reconcile the (possibly re-keyed) day.
      syncDay(dayId);
    },
    onError: onError('save the day'),
  });
  const saveItems = useMutation({
    // Serialized (shared scope) + optimistic cache write: rapid row commits each build
    // on the previous one instead of racing whole-day snapshots out of order.
    scope: { id: `saveScheduleDay-${eventId}` },
    mutationFn: ({
      day,
      items,
    }: {
      day: ScheduleDay;
      items: ScheduleDayItem[];
      /** Calendar ids of items this save removes — their events are deleted only
       * AFTER the save commits (a failed save must not strand a live id pointing at
       * a deleted Google event). */
      removedCalendarIds?: string[];
    }) => saveScheduleDay(eventId!, day, dayToInput({ ...day, items })),
    onMutate: ({ day, items }) => {
      queryClient.setQueryData<ScheduleDay[]>(['scheduleDays', eventId], (prev) =>
        prev?.map((d) => (d.id === day.id ? { ...d, items } : d)),
      );
    },
    onSuccess: (_data, { day, removedCalendarIds }) => {
      for (const calId of removedCalendarIds ?? []) {
        void removeScheduleCalendarEvent(eventId!, calId).catch((e) =>
          logger.error('Calendar event removal failed', e),
        );
      }
      invalidate();
      syncDay(day.id);
    },
    onError: (e) => {
      invalidate();
      onError('save the schedule')(e);
    },
  });
  const removeDay = useMutation({
    mutationFn: (day: ScheduleDay) => deleteScheduleDay(eventId!, day),
    onSuccess: invalidate,
    onError: onError('delete the day'),
  });
  const shiftDays = useMutation({
    mutationFn: (deltaDays: number) => shiftScheduleDays(eventId!, deltaDays, uid!),
    onSuccess: () => {
      invalidate();
      // Every day re-keyed — re-time all pushed items at their new dates.
      void listScheduleDays(eventId!)
        .then((days) => days.forEach((d) => syncDay(d.id)))
        .catch((e) => logger.error('Calendar sync failed', e));
    },
    onError: onError('shift the days'),
  });
  return { createDay, editDay, saveItems, removeDay, shiftDays };
}

/** Day / type / stage selects, backed by URL query params (shareable filtered views). */
function FilterBar({
  days,
  stages,
  day,
  type,
  stage,
  onChange,
  onClear,
}: {
  days: readonly ScheduleDay[];
  stages: readonly StageOption[];
  day: string;
  type: string;
  stage: string;
  onChange: (key: 'day' | 'type' | 'stage', value: string) => void;
  onClear: () => void;
}) {
  const selectClass =
    'min-h-11 rounded border border-line px-2 py-1 text-sm outline-none focus:border-brand sm:min-h-0';
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-ink">Filter:</span>
      <select className={selectClass} value={day} aria-label="Filter by day" onChange={(e) => onChange('day', e.target.value)}>
        <option value="">All days</option>
        {days.map((d) => (
          <option key={d.id} value={d.id}>
            {formatDateKey(d.date)}
          </option>
        ))}
      </select>
      <select className={selectClass} value={type} aria-label="Filter by type" onChange={(e) => onChange('type', e.target.value)}>
        <option value="">All types</option>
        {SCHEDULE_ITEM_TYPES.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      <select className={selectClass} value={stage} aria-label="Filter by stage" onChange={(e) => onChange('stage', e.target.value)}>
        <option value="">All stages</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {(day || type || stage) && (
        <button
          type="button"
          className="inline-flex min-h-11 items-center text-xs text-ink-muted hover:text-accent sm:min-h-0"
          onClick={onClear}
        >
          Clear
        </button>
      )}
    </div>
  );
}

/** Bulk "shift all days ±N" (the event slipped): re-keys every day doc in one batch. */
function ShiftControl({ pending, onShift }: { pending: boolean; onShift: (deltaDays: number) => void }) {
  const [delta, setDelta] = useState(0);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-ink">Shift all days</span>
      <input
        type="number"
        className="min-h-11 w-20 rounded border border-line px-2 py-1 text-sm outline-none focus:border-brand sm:min-h-0"
        value={delta}
        aria-label="Days to shift by"
        onChange={(e) => setDelta(Math.trunc(Number(e.target.value) || 0))}
      />
      <span className="text-ink-muted">days</span>
      <button
        type="button"
        disabled={pending || delta === 0}
        className="inline-flex min-h-11 items-center rounded border border-line px-3 py-1 text-xs font-semibold text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0"
        onClick={() => {
          onShift(delta);
          setDelta(0);
        }}
      >
        {pending ? 'Shifting…' : 'Apply'}
      </button>
    </div>
  );
}

/** Auto-sync hint for editors: what "Push to calendar" does, or the connect link. */
function GoogleSyncHint({ canEdit }: { canEdit: boolean }) {
  const connection = useGoogleConnection();
  if (!canEdit) return null;
  return (
    <p className="text-xs text-ink-muted">
      {connection.data?.connected === true ? (
        '“Push to calendar” items auto-sync to the event’s Google calendar on save.'
      ) : (
        <>
          <Link to="/settings" className="text-accent hover:underline">
            Connect Google
          </Link>{' '}
          to auto-sync “Push to calendar” items to the event’s calendar.
        </>
      )}
    </p>
  );
}

/** Loading / load-error / save-error notices for the screen. */
function ScheduleNotices({
  loading,
  loadFailed,
  saveFailed,
  createDayError,
}: {
  loading: boolean;
  loadFailed: boolean;
  saveFailed: boolean;
  createDayError: unknown;
}) {
  return (
    <>
      {loading && <p className="text-sm text-ink-muted">Loading schedule…</p>}
      {loadFailed && <p className="text-sm text-accent">Failed to load the schedule.</p>}
      {saveFailed && <p className="text-sm text-accent">Could not save — check your connection and try again.</p>}
      {createDayError != null && (
        <p className="text-sm text-accent">
          Could not add the day{createDayError instanceof Error ? ` — ${createDayError.message}` : '.'}
        </p>
      )}
    </>
  );
}

interface DayListProps {
  visibleDays: readonly ScheduleDay[];
  matchesFilters: (item: ScheduleDayItem) => boolean;
  editing: boolean;
  editingDayId: string | null;
  editPending: boolean;
  stages: readonly StageOption[];
  crewTypes: readonly string[];
  /** Placeholder resolution needs the day (lineups are per show day). */
  resolveTextForDay: (day: ScheduleDay) => ResolveItemText;
  onSubmitDayMeta: (day: ScheduleDay, meta: ScheduleDayMeta) => void;
  onCloseDayForm: () => void;
  onOpenDayForm: (dayId: string) => void;
  onDeleteDay: (day: ScheduleDay) => void;
  onAddItem: (day: ScheduleDay) => void;
  onCommitItem: (day: ScheduleDay, item: ScheduleDayItem) => void;
  onDeleteItem: (day: ScheduleDay, itemId: string) => void;
}

function DayList(props: DayListProps) {
  return (
    <>
      {props.visibleDays.map((day) =>
        props.editing && props.editingDayId === day.id ? (
          <ScheduleDayForm
            key={day.id}
            initial={day}
            submitLabel="Save day"
            pending={props.editPending}
            onSubmit={(meta) => props.onSubmitDayMeta(day, meta)}
            onCancel={props.onCloseDayForm}
          />
        ) : (
          <ScheduleDayCard
            key={day.id}
            day={day}
            dateLabel={formatDateKey(day.date)}
            items={day.items.filter(props.matchesFilters)}
            editing={props.editing}
            stages={props.stages}
            crewTypes={props.crewTypes}
            resolveText={props.resolveTextForDay(day)}
            onEditDay={() => props.onOpenDayForm(day.id)}
            onDeleteDay={() => props.onDeleteDay(day)}
            onAddItem={() => props.onAddItem(day)}
            onCommitItem={(item) => props.onCommitItem(day, item)}
            onDeleteItem={(itemId) => props.onDeleteItem(day, itemId)}
          />
        ),
      )}
    </>
  );
}

function anySaveFailed(mutations: ReadonlyArray<{ isError: boolean }>): boolean {
  return mutations.some((m) => m.isError);
}

/** URL-backed day/type/stage filter state (shareable filtered views). */
function useScheduleFilters() {
  const [search, setSearch] = useSearchParams();
  const filters = {
    day: search.get('day') ?? '',
    type: search.get('type') ?? '',
    stage: search.get('stage') ?? '',
  };
  const setFilter = (key: 'day' | 'type' | 'stage', value: string) =>
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  // One update for all three — same-tick setSearchParams calls don't chain.
  const clearFilters = () =>
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of ['day', 'type', 'stage']) next.delete(key);
        return next;
      },
      { replace: true },
    );
  return { filters, setFilter, clearFilters };
}

/** Title row: back link is the screen's; this is the h1 + the global Edit toggle. */
function ScreenHeader({
  name,
  canEdit,
  editing,
  onToggleEditing,
}: {
  name: string | undefined;
  canEdit: boolean;
  editing: boolean;
  onToggleEditing: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-3xl font-black tracking-tight text-brand">
        Schedule{name ? ` — ${name}` : ''}
      </h1>
      {canEdit && (
        <button
          type="button"
          onClick={onToggleEditing}
          className={`inline-flex min-h-11 items-center rounded px-3 py-1 text-sm font-semibold transition-colors sm:min-h-0 ${editing ? 'bg-ink text-surface' : 'border border-line text-ink-muted hover:text-ink'}`}
        >
          {editing ? 'Done editing' : 'Edit'}
        </button>
      )}
    </header>
  );
}

/** Edit-mode toolbar: add-day (button + form) and the bulk shift control. */
function EditToolbar({
  editing,
  addingDay,
  setAddingDay,
  dayCount,
  shiftPending,
  onShift,
  defaultDate,
  createPending,
  onCreateDay,
}: {
  editing: boolean;
  addingDay: boolean;
  setAddingDay: (v: boolean) => void;
  dayCount: number;
  shiftPending: boolean;
  onShift: (deltaDays: number) => void;
  defaultDate: string;
  createPending: boolean;
  onCreateDay: (meta: ScheduleDayMeta) => void;
}) {
  if (!editing) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line p-3">
        {!addingDay && (
          <button
            type="button"
            onClick={() => setAddingDay(true)}
            className="inline-flex min-h-11 items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:min-h-0"
          >
            + Add day
          </button>
        )}
        {dayCount > 0 && <ShiftControl pending={shiftPending} onShift={onShift} />}
      </div>
      {addingDay && (
        <ScheduleDayForm
          defaultDate={defaultDate}
          submitLabel="Add day"
          pending={createPending}
          onSubmit={onCreateDay}
          onCancel={() => setAddingDay(false)}
        />
      )}
    </>
  );
}

/** "No schedule days yet" (with an edit hint for editors), only once loading settles. */
function EmptyState({
  loaded,
  dayCount,
  addingDay,
  canEdit,
  editing,
}: {
  loaded: boolean;
  dayCount: number;
  addingDay: boolean;
  canEdit: boolean;
  editing: boolean;
}) {
  if (!loaded || dayCount > 0 || addingDay) return null;
  return (
    <p className="text-sm text-ink-muted">
      No schedule days yet.{canEdit && !editing ? ' Switch to Edit to add the first day.' : ''}
    </p>
  );
}

export function EventScheduleScreen() {
  const { eventId: eventParam } = useParams();
  const { user, isAdmin, isOrganizer } = useAuth();
  const { filters, setFilter, clearFilters } = useScheduleFilters();
  const [editing, setEditing] = useState(false);
  const [addingDay, setAddingDay] = useState(false);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);

  const { query: eventQuery, eventId } = useResolvedEvent(eventParam);
  const roleQuery = useQuery({
    queryKey: ['events', 'role', eventId, user?.uid],
    queryFn: () => getEventRole(user!.uid, eventId!),
    enabled: !!eventId && !!user,
  });
  const daysQuery = useQuery({ queryKey: ['scheduleDays', eventId], queryFn: () => listScheduleDays(eventId!), enabled: !!eventId });
  const stagesQuery = useQuery({ queryKey: ['stages', eventId], queryFn: () => listStages(eventId!), enabled: !!eventId });
  const advancesQuery = useQuery({ queryKey: ['eventAdvances', eventId], queryFn: () => listEventAdvances(eventId!), enabled: !!eventId });
  const crewTypesQuery = useQuery({ queryKey: crewTypesKey(), queryFn: getCrewTypes });

  const days = useMemo(() => daysQuery.data ?? [], [daysQuery.data]);
  const closeDayForms = () => {
    setAddingDay(false);
    setEditingDayId(null);
  };
  const { createDay, editDay, saveItems, removeDay, shiftDays } = useScheduleDayMutations(
    eventId,
    user?.uid,
    closeDayForms,
  );

  const stages: StageOption[] = (stagesQuery.data ?? []).map((s) => ({ id: s.id, name: s.name }));

  // Day-aware {artist N} lookup: an advance dated to the item's day wins its slot;
  // undated advances hold their slot event-wide (lib/advances/lineup.ts).
  const slotLookup = useMemo(() => buildSlotArtistLookup(advancesQuery.data ?? []), [advancesQuery.data]);
  const resolveTextForDay =
    (day: ScheduleDay): ResolveItemText =>
    (item, text) =>
      resolveArtistPlaceholders(text, (slot) =>
        item.stageId ? slotLookup.resolve(day.date, item.stageId, slot) : null,
      );

  if (!user || !eventParam) return null;
  const canEdit = canEditEvent({ uid: user.uid, isAdmin, isOrganizer }, roleQuery.data ?? null);

  const matchesFilters = makeItemFilter(filters.type, filters.stage);
  const visibleDays = days.filter((d) => !filters.day || d.id === filters.day);
  const visibleItems = visibleDays.flatMap((d) => d.items.filter(matchesFilters));

  return (
    <section className="space-y-5">
      <Link to={`/events/${eventParam}`} className="text-sm text-ink-muted hover:text-accent">
        ← Event
      </Link>

      <ScreenHeader
        name={eventQuery.data?.name}
        canEdit={canEdit}
        editing={editing}
        onToggleEditing={() => {
          if (editing) closeDayForms();
          setEditing((e) => !e);
        }}
      />

      <GoogleSyncHint canEdit={canEdit} />

      <ScheduleNotices
        loading={daysQuery.isLoading}
        loadFailed={daysQuery.isError}
        saveFailed={anySaveFailed([saveItems, editDay, removeDay, shiftDays])}
        createDayError={createDay.isError ? createDay.error : null}
      />

      {days.length > 0 && (
        <FilterBar
          days={days}
          stages={stages}
          day={filters.day}
          type={filters.type}
          stage={filters.stage}
          onChange={setFilter}
          onClear={clearFilters}
        />
      )}

      <EditToolbar
        editing={editing}
        addingDay={addingDay}
        setAddingDay={setAddingDay}
        dayCount={days.length}
        shiftPending={shiftDays.isPending}
        onShift={(d) => shiftDays.mutate(d)}
        defaultDate={dateInputValue(eventQuery.data?.startDate ?? null)}
        createPending={createDay.isPending}
        onCreateDay={(meta) => createDay.mutate(meta)}
      />

      {editing && (
        <ImportScheduleTemplatePanel
          eventId={eventId!}
          eventStart={eventQuery.data?.startDate ?? null}
          timeZone={eventQuery.data?.timeZone ?? APP_TIME_ZONE}
          stages={stages}
          uid={user.uid}
        />
      )}

      <EmptyState
        loaded={!!daysQuery.data}
        dayCount={days.length}
        addingDay={addingDay}
        canEdit={canEdit}
        editing={editing}
      />

      <DayList
        visibleDays={visibleDays}
        matchesFilters={matchesFilters}
        editing={editing}
        editingDayId={editingDayId}
        editPending={editDay.isPending}
        stages={stages}
        crewTypes={crewTypesQuery.data ?? []}
        resolveTextForDay={resolveTextForDay}
        onSubmitDayMeta={(day, meta) => editDay.mutate({ day, meta })}
        onCloseDayForm={() => setEditingDayId(null)}
        onOpenDayForm={setEditingDayId}
        onDeleteDay={(day) => removeDay.mutate(day)}
        onAddItem={(day) => saveItems.mutate({ day, items: [...day.items, blankItem()] })}
        onCommitItem={(day, item) =>
          saveItems.mutate({ day, items: day.items.map((i) => (i.id === item.id ? item : i)) })
        }
        onDeleteItem={(day, itemId) => {
          const removed = day.items.find((i) => i.id === itemId);
          saveItems.mutate({
            day,
            items: day.items.filter((i) => i.id !== itemId),
            removedCalendarIds: removed?.googleCalendarEventId ? [removed.googleCalendarEventId] : undefined,
          });
        }}
      />

      <ScheduleTypeLegend items={visibleItems} />
    </section>
  );
}
