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
import { formatCentralDate, formatCentralTime, centralDayKey } from '@/lib/dates/timezone';
import {
  SCHEDULE_SECTIONS,
  SCHEDULE_SECTION_KEYS,
  scheduleSectionDef,
  scheduleSectionLabel,
  type ScheduleSection,
} from '@/lib/schedules/sections';
import type { ScheduleItem, ScheduleItemInput } from '@/lib/schedules/scheduleItem';
import { listStages } from './stages-service';
import { listEventAdvances } from '@/lib/tracker/tracker-service';
import { getEvent } from './events-service';
import {
  createScheduleItem,
  deleteScheduleItem,
  listScheduleItems,
  setScheduleItemMaster,
  updateScheduleItem,
} from './schedule-service';
import { ScheduleItemForm, type AdvanceOption, type StageOption } from './ScheduleItemForm';

const logger = createLogger('Schedule');

interface DayGroup {
  key: string;
  label: string;
  items: ScheduleItem[];
}

function groupByDay(items: ScheduleItem[]): DayGroup[] {
  const map = new Map<string, ScheduleItem[]>();
  for (const it of items) {
    const key = centralDayKey(it.startAt) || 'no-time';
    const arr = map.get(key);
    if (arr) arr.push(it);
    else map.set(key, [it]);
  }
  return [...map.keys()]
    .sort((a, b) => (a === 'no-time' ? 1 : b === 'no-time' ? -1 : a.localeCompare(b)))
    .map((key) => ({
      key,
      label: key === 'no-time' ? 'No time set' : formatCentralDate(map.get(key)![0].startAt),
      items: map.get(key)!,
    }));
}

export function EventScheduleScreen() {
  const { eventId } = useParams();
  const { user, isAdmin, isOrganizer } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<'edit' | 'master'>('edit');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [enabledSections, setEnabledSections] = useState<Set<ScheduleSection>>(
    () => new Set(SCHEDULE_SECTION_KEYS),
  );

  const roleQuery = useQuery({
    queryKey: ['events', 'role', eventId, user?.uid],
    queryFn: () => getEventRole(user!.uid, eventId!),
    enabled: !!eventId && !!user,
  });
  const eventQuery = useQuery({ queryKey: ['events', 'detail', eventId], queryFn: () => getEvent(eventId!), enabled: !!eventId });
  const itemsQuery = useQuery({ queryKey: ['schedule', eventId], queryFn: () => listScheduleItems(eventId!), enabled: !!eventId });
  const stagesQuery = useQuery({ queryKey: ['stages', eventId], queryFn: () => listStages(eventId!), enabled: !!eventId });
  const advancesQuery = useQuery({ queryKey: ['eventAdvances', eventId], queryFn: () => listEventAdvances(eventId!), enabled: !!eventId });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['schedule', eventId] });

  const create = useMutation({
    mutationFn: (input: ScheduleItemInput) => createScheduleItem(eventId!, input, user!.uid),
    onSuccess: () => { invalidate(); setAdding(false); },
    onError: (e) => logger.error('Failed to create schedule item', e),
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ScheduleItemInput }) => updateScheduleItem(eventId!, id, input),
    onSuccess: () => { invalidate(); setEditingId(null); },
    onError: (e) => logger.error('Failed to update schedule item', e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteScheduleItem(eventId!, id),
    onSuccess: invalidate,
    onError: (e) => logger.error('Failed to delete schedule item', e),
  });
  const toggleMaster = useMutation({
    mutationFn: ({ id, include }: { id: string; include: boolean }) => setScheduleItemMaster(eventId!, id, include),
    onSuccess: invalidate,
    onError: (e) => logger.error('Failed to toggle master', e),
  });

  const stages: StageOption[] = (stagesQuery.data ?? []).map((s) => ({ id: s.id, name: s.name }));
  const advances: AdvanceOption[] = (advancesQuery.data ?? []).map((a) => ({
    id: a.advance.id,
    label: `${a.advance.artistName} · ${a.stageName}`,
  }));
  const stageName = useMemo(() => new Map(stages.map((s) => [s.id, s.name])), [stages]);
  const advanceLabel = useMemo(() => new Map(advances.map((a) => [a.id, a.label])), [advances]);

  if (!user || !eventId) return null;
  const canEdit = canEditEvent({ uid: user.uid, isAdmin, isOrganizer }, roleQuery.data ?? null);

  const items = itemsQuery.data ?? [];
  const masterItems = items.filter((it) => it.includeInMaster && enabledSections.has(it.section));
  const editGroups = groupByDay(items);
  const masterGroups = groupByDay(masterItems);

  const summarize = (it: ScheduleItem): string => {
    const parts: string[] = [];
    if (it.stageId) parts.push(stageName.get(it.stageId) ?? 'Stage');
    if (it.advanceId) parts.push(advanceLabel.get(it.advanceId) ?? 'Act');
    if (it.location) parts.push(it.location);
    for (const f of scheduleSectionDef(it.section).fields) {
      if (it.fields[f.key]) parts.push(`${f.label}: ${it.fields[f.key]}`);
    }
    return parts.join(' · ');
  };

  return (
    <section className="space-y-6">
      <Link to={`/events/${eventId}`} className="text-sm text-ink-muted hover:text-accent">
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
              className={`rounded px-3 py-1 capitalize transition-colors ${view === v ? 'bg-brand text-brand-fg' : 'text-ink-muted hover:text-ink'}`}
            >
              {v === 'master' ? 'Master' : 'Edit'}
            </button>
          ))}
        </div>
      </header>

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
                    advances={advances}
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

          {itemsQuery.data && items.length === 0 && !adding && (
            <p className="text-sm text-ink-muted">No schedule items yet.</p>
          )}

          {editGroups.map((day) => (
            <div key={day.key} className="space-y-2">
              <h2 className="font-display text-lg font-bold text-brand">{day.label}</h2>
              <ul className="space-y-2">
                {day.items.map((it) =>
                  editingId === it.id ? (
                    <li key={it.id} className="rounded-lg border border-line bg-surface-muted/40 p-4">
                      <ScheduleItemForm
                        initial={it}
                        stages={stages}
                        advances={advances}
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
                            {formatCentralTime(it.startAt) || '—'}
                            {it.endAt ? `–${formatCentralTime(it.endAt)}` : ''}
                          </span>
                          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-muted">
                            {scheduleSectionLabel(it.section, it.customLabel)}
                          </span>
                          <span className="font-semibold text-ink">{it.title}</span>
                          {!it.includeInMaster && (
                            <span className="text-[0.65rem] text-ink-muted">(hidden from master)</span>
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
                            <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(it.id)} className="text-ink-muted hover:text-accent disabled:opacity-50">
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
                <ul className="divide-y divide-line/60">
                  {day.items.map((it) => (
                    <li key={it.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
                      <span className="w-28 shrink-0 font-semibold text-ink-muted">
                        {formatCentralTime(it.startAt) || '—'}
                        {it.endAt ? `–${formatCentralTime(it.endAt)}` : ''}
                      </span>
                      <span className="font-medium text-ink">{it.title}</span>
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
