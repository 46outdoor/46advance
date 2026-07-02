/**
 * Event schedule (Phase 12a). Two views: **Edit** (section-aware authoring, grouped by day)
 * and **Master** (aggregated read-only — toggle whole sections, with per-item include/exclude).
 * All times Central. Master = items with `includeInMaster` whose section is toggled on.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { canEditEvent } from '@/lib/rbac/permissions';
import { getEventRole } from '@/lib/rbac/membership';
import { APP_TIME_ZONE, formatZonedDate, formatZonedTime, zonedDayKey } from '@/lib/dates/timezone';
import {
  SCHEDULE_SECTIONS,
  SCHEDULE_SECTION_KEYS,
  scheduleSectionDef,
  scheduleSectionLabel,
  type ScheduleSection,
} from '@/lib/schedules/sections';
import type { ScheduleItem, ScheduleItemInput } from '@/lib/schedules/scheduleItem';
import { slotLabel } from '@/lib/advances/advance';
import { eventScheduleDays } from '@/lib/events/event';
import { listStages } from './stages-service';
import { listEventAdvances } from '@/lib/tracker/tracker-service';
import { useResolvedEvent } from './useResolvedEvent';
import {
  applyScheduleTemplate,
  createScheduleItem,
  deleteScheduleItem,
  listScheduleItems,
  pushScheduleItem,
  removeScheduleCalendarEvent,
  setScheduleItemMaster,
  updateScheduleItem,
} from './schedule-service';
import { listScheduleTemplates } from '@/lib/schedules/schedule-templates-service';
import { scheduleTemplateCategoryLabel, type ScheduleTemplate } from '@/lib/schedules/scheduleTemplate';
import { useGoogleConnection } from '@/lib/google';
import { ScheduleItemForm, type StageOption } from './ScheduleItemForm';
import { listScheduleNotes, setScheduleNote, type DayNoteField } from './schedule-notes-service';
import { DayNotesEditor, DayNotesDisplay } from './ScheduleDayNotes';

const logger = createLogger('Schedule');

interface DayGroup {
  key: string;
  label: string;
  items: ScheduleItem[];
}

/** The event's timezone, defaulting to Central. */
function eventTimeZone(event: { timeZone?: string } | null | undefined): string {
  return event?.timeZone ?? APP_TIME_ZONE;
}

function groupByDay(items: ScheduleItem[], timeZone: string): DayGroup[] {
  const map = new Map<string, ScheduleItem[]>();
  for (const it of items) {
    const key = zonedDayKey(it.startAt, timeZone) || 'no-time';
    const arr = map.get(key);
    if (arr) arr.push(it);
    else map.set(key, [it]);
  }
  return [...map.keys()]
    .sort((a, b) => (a === 'no-time' ? 1 : b === 'no-time' ? -1 : a.localeCompare(b)))
    .map((key) => ({
      key,
      label: key === 'no-time' ? 'No time set' : formatZonedDate(map.get(key)![0].startAt, timeZone),
      items: map.get(key)!,
    }));
}

/** The item's heading. A Show slot shows the artist holding it (slot label as a tooltip),
 * falling back to the slot label as a placeholder until one is assigned; else the typed title. */
function itemHeading(it: ScheduleItem, slotArtist: Map<string, string>): { name: string; tip?: string } {
  if (it.slot == null) return { name: it.title };
  const artist = (it.stageId && slotArtist.get(`${it.stageId}:${it.slot}`)) || null;
  return artist ? { name: artist, tip: slotLabel(it.slot) } : { name: slotLabel(it.slot) };
}

/** One-line detail under an item: stage · act (legacy advance link) · location · section fields. */
function summarizeItem(
  it: ScheduleItem,
  stageName: Map<string, string>,
  advanceLabel: Map<string, string>,
): string {
  const parts: string[] = [];
  if (it.stageId) parts.push(stageName.get(it.stageId) ?? 'Stage');
  if (it.slot == null && it.advanceId) parts.push(advanceLabel.get(it.advanceId) ?? 'Act');
  if (it.location) parts.push(it.location);
  for (const f of scheduleSectionDef(it.section).fields) {
    if (it.fields[f.key]) parts.push(`${f.label}: ${it.fields[f.key]}`);
  }
  return parts.join(' · ');
}

/** "Import from schedule template" control — applies a saved blueprint to this event's schedule. */
function ImportTemplatePanel({
  templates,
  importId,
  onSelect,
  onImport,
  pending,
  succeeded,
  failed,
}: {
  templates: ScheduleTemplate[];
  importId: string;
  onSelect: (id: string) => void;
  onImport: () => void;
  pending: boolean;
  succeeded: boolean;
  failed: boolean;
}) {
  if (templates.length === 0) return null;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Import from schedule template</span>
        <select
          className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          value={importId}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="">Select a template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {scheduleTemplateCategoryLabel(t.category)} · {t.items.length} item{t.items.length === 1 ? '' : 's'}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!importId || pending}
        onClick={onImport}
        className="rounded border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {pending ? 'Importing…' : 'Import'}
      </button>
      {succeeded && <span className="text-sm text-status-complete">Imported.</span>}
      {failed && <span className="text-sm text-accent">Could not import.</span>}
    </div>
  );
}

export function EventScheduleScreen() {
  const { eventId: eventParam } = useParams();
  const { user, isAdmin, isOrganizer } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<'edit' | 'master'>('edit');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importId, setImportId] = useState('');
  const [enabledSections, setEnabledSections] = useState<Set<ScheduleSection>>(
    () => new Set(SCHEDULE_SECTION_KEYS),
  );

  // Resolve slug-or-id → canonical event once; every sub-query keys on the resolved id.
  const { query: eventQuery, eventId } = useResolvedEvent(eventParam);
  const timeZone = eventTimeZone(eventQuery.data);
  const roleQuery = useQuery({
    queryKey: ['events', 'role', eventId, user?.uid],
    queryFn: () => getEventRole(user!.uid, eventId!),
    enabled: !!eventId && !!user,
  });
  const itemsQuery = useQuery({ queryKey: ['schedule', eventId], queryFn: () => listScheduleItems(eventId!), enabled: !!eventId });
  const stagesQuery = useQuery({ queryKey: ['stages', eventId], queryFn: () => listStages(eventId!), enabled: !!eventId });
  const advancesQuery = useQuery({ queryKey: ['eventAdvances', eventId], queryFn: () => listEventAdvances(eventId!), enabled: !!eventId });
  const scheduleTemplatesQuery = useQuery({ queryKey: ['scheduleTemplates'], queryFn: listScheduleTemplates, enabled: !!eventId });
  const scheduleNotesQuery = useQuery({ queryKey: ['scheduleNotes', eventId], queryFn: () => listScheduleNotes(eventId!), enabled: !!eventId });

  const connection = useGoogleConnection();
  const isConnected = connection.data?.connected === true;
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['schedule', eventId] });
  /** Auto-push: reconcile the item with the event's Google calendar after a save (fire-and-forget). */
  const syncItem = (itemId: string) => {
    void pushScheduleItem(eventId!, itemId)
      .then(() => invalidate())
      .catch((e) => logger.error('Calendar sync failed', e));
  };

  const create = useMutation({
    mutationFn: (input: ScheduleItemInput) => createScheduleItem(eventId!, input, user!.uid),
    onSuccess: (id) => { invalidate(); setAdding(false); syncItem(id); },
    onError: (e) => logger.error('Failed to create schedule item', e),
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ScheduleItemInput }) => updateScheduleItem(eventId!, id, input),
    onSuccess: (_data, vars) => { invalidate(); setEditingId(null); syncItem(vars.id); },
    onError: (e) => logger.error('Failed to update schedule item', e),
  });
  const remove = useMutation({
    mutationFn: async (item: ScheduleItem) => {
      await deleteScheduleItem(eventId!, item.id);
      if (item.googleCalendarEventId) await removeScheduleCalendarEvent(eventId!, item.googleCalendarEventId);
    },
    onSuccess: invalidate,
    onError: (e) => logger.error('Failed to delete schedule item', e),
  });
  const toggleMaster = useMutation({
    mutationFn: ({ id, include }: { id: string; include: boolean }) => setScheduleItemMaster(eventId!, id, include),
    onSuccess: (_data, vars) => { invalidate(); syncItem(vars.id); },
    onError: (e) => logger.error('Failed to toggle master', e),
  });

  const stages: StageOption[] = (stagesQuery.data ?? []).map((s) => ({ id: s.id, name: s.name }));
  const scheduleDays = useMemo(
    () =>
      eventScheduleDays(
        eventQuery.data?.startDate,
        eventQuery.data?.endDate,
        eventQuery.data?.loadInDays,
        eventQuery.data?.loadOutDays,
        timeZone,
      ),
    [eventQuery.data, timeZone],
  );
  const stageName = useMemo(() => new Map(stages.map((s) => [s.id, s.name])), [stages]);
  const advanceLabel = useMemo(
    () =>
      new Map(
        (advancesQuery.data ?? []).map((a) => [a.advance.id, `${a.advance.artistName} · ${a.stageName}`]),
      ),
    [advancesQuery.data],
  );
  /** (stageId:slot) → artist, for resolving Show slot placeholders to the assigned act. */
  const slotArtist = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of advancesQuery.data ?? []) {
      if (a.advance.slot != null) m.set(`${a.stageId}:${a.advance.slot}`, a.advance.artistName);
    }
    return m;
  }, [advancesQuery.data]);

  const importTemplate = useMutation({
    mutationFn: () => {
      const tpl = scheduleTemplatesQuery.data?.find((t) => t.id === importId);
      if (!tpl) throw new Error('No template selected.');
      return applyScheduleTemplate(eventId!, eventQuery.data?.startDate ?? null, timeZone, tpl, stages, user!.uid);
    },
    onSuccess: () => {
      invalidate();
      setImportId('');
    },
    onError: (e) => logger.error('Failed to import schedule template', e),
  });

  const setNote = useMutation({
    mutationFn: ({ dayKey, field, text }: { dayKey: string; field: DayNoteField; text: string }) =>
      setScheduleNote(eventId!, dayKey, field, text),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['scheduleNotes', eventId] }),
    onError: (e) => logger.error('Failed to save schedule note', e),
  });

  if (!user || !eventParam) return null;
  const canEdit = canEditEvent({ uid: user.uid, isAdmin, isOrganizer }, roleQuery.data ?? null);

  const items = itemsQuery.data ?? [];
  const masterItems = items.filter((it) => it.includeInMaster && enabledSections.has(it.section));
  const editGroups = groupByDay(items, timeZone);
  const masterGroups = groupByDay(masterItems, timeZone);

  const summarize = (it: ScheduleItem): string => summarizeItem(it, stageName, advanceLabel);

  return (
    <section className="space-y-6">
      <Link to={`/events/${eventParam}`} className="text-sm text-ink-muted hover:text-accent">
        ← Event
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-black tracking-tight text-brand">
          Schedule{eventQuery.data ? ` — ${eventQuery.data.name}` : ''}
        </h1>
        <div className="flex items-center gap-1 rounded-lg border border-line p-0.5 text-sm">
          {(['edit', 'master'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded px-3 py-1 capitalize transition-colors ${view === v ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink'}`}
            >
              {v === 'master' ? 'Master' : 'Edit'}
            </button>
          ))}
        </div>
      </header>

      {canEdit && (
        <p className="text-xs text-ink-muted">
          {isConnected ? (
            'Master-schedule items auto-sync to your Google calendar on save.'
          ) : (
            <>
              <Link to="/settings" className="text-accent hover:underline">
                Connect Google
              </Link>{' '}
              to auto-sync the master schedule to a calendar.
            </>
          )}
        </p>
      )}

      {itemsQuery.isLoading && <p className="text-sm text-ink-muted">Loading schedule…</p>}
      {itemsQuery.isError && <p className="text-sm text-accent">Failed to load the schedule.</p>}

      {view === 'edit' ? (
        <div className="space-y-5">
          {canEdit && (
            <div>
              {adding ? (
                <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
                  <h2 className="mb-3 font-display text-lg font-bold text-brand">New schedule item</h2>
                  <ScheduleItemForm
                    stages={stages}
                    scheduleDays={scheduleDays}
                    timeZone={timeZone}
                    submitLabel="Add item"
                    pending={create.isPending}
                    error={create.isError ? 'Could not add the item.' : null}
                    onSubmit={(input) => create.mutate(input)}
                    onCancel={() => setAdding(false)}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Add item
                </button>
              )}
            </div>
          )}

          {canEdit && (
            <ImportTemplatePanel
              templates={scheduleTemplatesQuery.data ?? []}
              importId={importId}
              onSelect={setImportId}
              onImport={() => importTemplate.mutate()}
              pending={importTemplate.isPending}
              succeeded={importTemplate.isSuccess}
              failed={importTemplate.isError}
            />
          )}

          {itemsQuery.data && items.length === 0 && !adding && (
            <p className="text-sm text-ink-muted">No schedule items yet.</p>
          )}

          {editGroups.map((day) => (
            <div key={day.key} className="space-y-2">
              <h2 className="font-display text-lg font-bold text-brand">{day.label}</h2>
              {canEdit && (
                <DayNotesEditor
                  notes={scheduleNotesQuery.data?.get(day.key)}
                  onSave={(field, text) => setNote.mutate({ dayKey: day.key, field, text })}
                />
              )}
              <ul className="space-y-2">
                {day.items.map((it) =>
                  editingId === it.id ? (
                    <li key={it.id} className="rounded-lg border border-line bg-surface-muted/40 p-4">
                      <ScheduleItemForm
                        initial={it}
                        stages={stages}
                        scheduleDays={scheduleDays}
                        timeZone={timeZone}
                        submitLabel="Save changes"
                        pending={update.isPending}
                        error={update.isError ? 'Could not save.' : null}
                        onSubmit={(input) => update.mutate({ id: it.id, input })}
                        onCancel={() => setEditingId(null)}
                      />
                    </li>
                  ) : (
                    <li key={it.id} className="rounded-lg border border-line p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-sm font-semibold text-ink-muted">
                            {formatZonedTime(it.startAt, timeZone) || '—'}
                            {it.endAt ? `–${formatZonedTime(it.endAt, timeZone)}` : ''}
                          </span>
                          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-muted">
                            {scheduleSectionLabel(it.section, it.customLabel)}
                          </span>
                          <span className="font-semibold text-ink" title={itemHeading(it, slotArtist).tip}>
                            {itemHeading(it, slotArtist).name}
                          </span>
                          {!it.includeInMaster && (
                            <span className="text-[0.65rem] text-ink-muted">(hidden from master)</span>
                          )}
                          {it.googleCalendarEventId && (
                            <span className="text-[0.65rem] font-semibold text-status-complete">on calendar</span>
                          )}
                        </div>
                        {canEdit && (
                          <div className="flex shrink-0 gap-2 text-xs">
                            <button type="button" onClick={() => toggleMaster.mutate({ id: it.id, include: !it.includeInMaster })} className="text-ink-muted hover:text-accent">
                              {it.includeInMaster ? 'Hide' : 'Show'}
                            </button>
                            <button type="button" onClick={() => setEditingId(it.id)} className="text-ink-muted hover:text-accent">
                              Edit
                            </button>
                            <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(it)} className="text-ink-muted hover:text-accent disabled:opacity-50">
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                      {summarize(it) && <p className="mt-0.5 text-xs text-ink-muted">{summarize(it)}</p>}
                      {it.notes && <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{it.notes}</p>}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 text-sm">
            <span className="font-semibold text-ink">Sections:</span>
            {SCHEDULE_SECTIONS.map((s) => (
              <label key={s.key} className="inline-flex items-center gap-1.5 text-ink-muted">
                <input
                  type="checkbox"
                  checked={enabledSections.has(s.key)}
                  onChange={(e) =>
                    setEnabledSections((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(s.key);
                      else next.delete(s.key);
                      return next;
                    })
                  }
                />
                {s.label}
              </label>
            ))}
          </div>

          {masterItems.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing in the master schedule for the selected sections.</p>
          ) : (
            masterGroups.map((day) => (
              <div key={day.key} className="space-y-1">
                <h2 className="font-display text-lg font-bold text-brand">{day.label}</h2>
                <DayNotesDisplay notes={scheduleNotesQuery.data?.get(day.key)} />
                <ul className="divide-y divide-line/60">
                  {day.items.map((it) => (
                    <li key={it.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
                      <span className="w-28 shrink-0 font-semibold text-ink-muted">
                        {formatZonedTime(it.startAt, timeZone) || '—'}
                        {it.endAt ? `–${formatZonedTime(it.endAt, timeZone)}` : ''}
                      </span>
                      <span className="font-medium text-ink" title={itemHeading(it, slotArtist).tip}>
                        {itemHeading(it, slotArtist).name}
                      </span>
                      <span className="text-xs text-ink-muted">{scheduleSectionLabel(it.section, it.customLabel)}</span>
                      {summarize(it) && <span className="basis-full pl-28 text-xs text-ink-muted">{summarize(it)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
