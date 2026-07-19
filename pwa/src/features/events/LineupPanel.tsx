/**
 * Lineup panel (event page): slot-first view of the advances — per show day, each
 * stage lists its numbered lineup slots (Headliner, Direct Support, Artist N). Typing
 * an artist into an open slot books it by CREATING that artist's advance
 * automatically; an existing advance on the stage with the same name (same day, or
 * undated) is re-slotted instead of duplicated. Removing a booked artist deletes a
 * data-less shell after an inline confirm, while an advance with entered data warns
 * and offers keep-without-slot vs delete-with-data. Advances stay the single source
 * of truth — the schedule's `{artist N}` placeholders and calendar sync read them.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { formatDateKey } from '@/lib/dates/formatting';
import { dateInputValue, parseDateInput } from '@/lib/dates/parsing';
import { slotLabel } from '@/lib/advances/advance';
import { advanceDataSummary, advanceHasData, performanceDayKey } from '@/lib/advances/lineup';
import { eventDays, type EventRecord } from '@/lib/events/event';
import type { LocatedAdvance } from '@/lib/tracker/tracker';
import { listEventAdvances } from '@/lib/tracker/tracker-service';
import { listStages } from './stages-service';
import { createAdvance, deleteAdvance, updateAdvanceLineup } from './advances-service';

const logger = createLogger('Lineup');

const inputClass =
  'min-h-11 rounded border border-line px-3 py-1.5 text-sm outline-none focus:border-brand sm:min-h-0';

interface BookInput {
  stageId: string;
  slot: number;
  /** '' books without a performance day (undated single-group events). */
  dayKey: string;
  name: string;
}

interface RemoveInput {
  located: LocatedAdvance;
  /** 'clear' keeps the advance without a slot; 'delete' removes it and its data. */
  mode: 'clear' | 'delete';
}

/** One lineup group: a show day (or the undated pool). */
interface LineupGroup {
  key: string;
  label: string;
  /** The undated pool lists stragglers but doesn't take new bookings. */
  canBook: boolean;
}

function lineupGroups(event: EventRecord, located: readonly LocatedAdvance[]): LineupGroup[] {
  const days = eventDays(event.startDate, event.endDate);
  if (days.length === 0) return [{ key: '', label: 'Lineup', canBook: true }];
  const groups: LineupGroup[] = days.map((d) => {
    const key = dateInputValue(d);
    return { key, label: formatDateKey(key), canBook: true };
  });
  const hasUndatedSlots = located.some((l) => l.advance.slot != null && !performanceDayKey(l.advance));
  if (hasUndatedSlots) groups.push({ key: '', label: 'No day set', canBook: false });
  return groups;
}

export function LineupPanel({ event, canEdit }: { event: EventRecord; canEdit: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const stagesQuery = useQuery({ queryKey: ['stages', event.id], queryFn: () => listStages(event.id) });
  const advancesQuery = useQuery({
    queryKey: ['eventAdvances', event.id],
    queryFn: () => listEventAdvances(event.id),
  });
  const located = advancesQuery.data ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['eventAdvances', event.id] });
    void queryClient.invalidateQueries({ queryKey: ['advances', event.id] });
  };

  const book = useMutation({
    mutationFn: async ({ stageId, slot, dayKey, name }: BookInput) => {
      const trimmed = name.trim();
      const date = dayKey ? parseDateInput(dayKey) : null;
      const candidates = located.filter(
        (l) => l.stageId === stageId && l.advance.artistName.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      // Same-day match first, then an undated one to adopt into the day; a match dated
      // to a DIFFERENT day is a separate performance and gets its own advance.
      const existing =
        candidates.find((l) => performanceDayKey(l.advance) === dayKey) ??
        candidates.find((l) => !performanceDayKey(l.advance));
      if (existing) {
        await updateAdvanceLineup(event.id, stageId, existing.advance.id, {
          slot,
          performanceDate: date ?? existing.advance.performanceDate,
        });
        return;
      }
      await createAdvance(
        event.id,
        stageId,
        { artistName: trimmed, slot, performanceDate: date },
        event.departmentIds,
        user!.uid,
      );
    },
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to book the lineup slot', err),
  });

  const remove = useMutation({
    mutationFn: ({ located: l, mode }: RemoveInput) =>
      mode === 'delete'
        ? deleteAdvance(event.id, l.stageId, l.advance.id)
        : updateAdvanceLineup(event.id, l.stageId, l.advance.id, {
            slot: null,
            performanceDate: l.advance.performanceDate,
          }),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to remove the lineup slot', err),
  });

  const stages = stagesQuery.data ?? [];
  const groups = lineupGroups(event, located);
  const busy = book.isPending || remove.isPending;

  return (
    <div className="space-y-4 border-t border-line pt-6">
      <h2 className="font-display text-xl font-bold text-brand">Lineup</h2>

      {(stagesQuery.isLoading || advancesQuery.isLoading) && (
        <p className="text-sm text-ink-muted">Loading lineup…</p>
      )}
      {(stagesQuery.isError || advancesQuery.isError) && (
        <p className="text-sm text-accent">Failed to load the lineup.</p>
      )}
      {(book.isError || remove.isError) && (
        <p className="text-sm text-accent">Could not update the lineup — try again.</p>
      )}
      {stagesQuery.data && stages.length === 0 && (
        <p className="text-sm text-ink-muted">Add a stage first — the lineup lives on the stages.</p>
      )}

      {stages.length > 0 &&
        groups.map((group) => (
          <div key={group.key || 'undated'} className="space-y-3">
            {groups.length > 1 && (
              <h3 className="text-sm font-semibold text-ink">{group.label}</h3>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              {stages.map((stage) => (
                <StageLineupCard
                  key={stage.id}
                  eventId={event.id}
                  stageName={stage.name}
                  group={group}
                  occupants={located.filter(
                    (l) =>
                      l.stageId === stage.id &&
                      l.advance.slot != null &&
                      performanceDayKey(l.advance) === group.key,
                  )}
                  canEdit={canEdit}
                  busy={busy}
                  onBook={(slot, name) => book.mutate({ stageId: stage.id, slot, dayKey: group.key, name })}
                  onRemove={(l, mode) => remove.mutate({ located: l, mode })}
                />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

function StageLineupCard({
  eventId,
  stageName,
  group,
  occupants,
  canEdit,
  busy,
  onBook,
  onRemove,
}: {
  eventId: string;
  stageName: string;
  group: LineupGroup;
  occupants: readonly LocatedAdvance[];
  canEdit: boolean;
  busy: boolean;
  onBook: (slot: number, name: string) => void;
  onRemove: (located: LocatedAdvance, mode: 'clear' | 'delete') => void;
}) {
  const highest = Math.max(0, ...occupants.map((l) => l.advance.slot ?? 0));
  const [extraSlots, setExtraSlots] = useState(0);
  // The undated pool only shows the slots actually in use.
  const slotCount = group.canBook ? Math.max(5, highest) + extraSlots : highest;

  return (
    <section className="rounded-lg border border-line">
      <header className="border-b border-line px-3 py-2 text-sm font-bold text-ink">{stageName}</header>
      <ol className="divide-y divide-line/60">
        {Array.from({ length: slotCount }, (_, i) => i + 1).map((slot) => (
          <SlotRow
            key={slot}
            eventId={eventId}
            slot={slot}
            occupants={occupants.filter((l) => l.advance.slot === slot)}
            canBook={canEdit && group.canBook}
            canEdit={canEdit}
            busy={busy}
            onBook={(name) => onBook(slot, name)}
            onRemove={onRemove}
          />
        ))}
      </ol>
      {canEdit && group.canBook && (
        <div className="border-t border-line px-3 py-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-xs font-semibold text-ink-muted transition-colors hover:text-accent sm:min-h-0"
            onClick={() => setExtraSlots((n) => n + 1)}
          >
            + Add slot
          </button>
        </div>
      )}
    </section>
  );
}

function SlotRow({
  eventId,
  slot,
  occupants,
  canBook,
  canEdit,
  busy,
  onBook,
  onRemove,
}: {
  eventId: string;
  slot: number;
  occupants: readonly LocatedAdvance[];
  canBook: boolean;
  canEdit: boolean;
  busy: boolean;
  onBook: (name: string) => void;
  onRemove: (located: LocatedAdvance, mode: 'clear' | 'delete') => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState<LocatedAdvance | null>(null);

  const submit = () => {
    if (!name.trim()) return;
    onBook(name);
    setName('');
    setAdding(false);
  };

  return (
    <li className="space-y-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-32 shrink-0 text-xs font-semibold text-ink-muted">
          {slot} · {slotLabel(slot)}
        </span>
        {occupants.length === 0 &&
          (adding ? (
            <span className="flex items-center gap-2">
              <input
                className={inputClass}
                value={name}
                autoFocus
                placeholder="Artist name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                  if (e.key === 'Escape') setAdding(false);
                }}
              />
              <button
                type="button"
                disabled={busy || !name.trim()}
                className="inline-flex min-h-11 items-center rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-0"
                onClick={submit}
              >
                Book
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center text-xs text-ink-muted hover:text-ink sm:min-h-0"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </span>
          ) : canBook ? (
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-sm text-ink-muted transition-colors hover:text-accent sm:min-h-0"
              onClick={() => setAdding(true)}
            >
              + Book artist
            </button>
          ) : (
            <span className="text-sm text-ink-muted">— Open —</span>
          ))}
        {occupants.map((l) => (
          <span key={l.advance.id} className="flex items-center gap-2">
            <Link
              to={`/events/${eventId}/stages/${l.stageId}/advances/${l.advance.id}`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-ink transition-colors hover:text-accent sm:min-h-0"
            >
              {l.advance.artistName}
            </Link>
            {canEdit && (
              <button
                type="button"
                className="inline-flex min-h-11 items-center text-xs text-ink-muted hover:text-accent sm:min-h-0"
                onClick={() => setConfirming(l)}
              >
                Remove
              </button>
            )}
          </span>
        ))}
        {occupants.length > 1 && (
          <span className="text-xs font-semibold text-accent">
            Slot conflict — {occupants.length} artists hold this slot.
          </span>
        )}
      </div>

      {confirming && (
        <RemoveConfirm
          located={confirming}
          busy={busy}
          onRemove={(mode) => {
            onRemove(confirming, mode);
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </li>
  );
}

/** Inline displace warning: a data-less shell offers a plain delete; an advance with
 * entered data spells out what it holds and offers keep-without-slot vs delete. */
function RemoveConfirm({
  located,
  busy,
  onRemove,
  onCancel,
}: {
  located: LocatedAdvance;
  busy: boolean;
  onRemove: (mode: 'clear' | 'delete') => void;
  onCancel: () => void;
}) {
  const hasData = advanceHasData(located.advance);
  const buttonClass =
    'inline-flex min-h-11 items-center rounded border border-line px-3 py-1.5 text-xs font-semibold transition-colors hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0';
  return (
    <div className="rounded border border-line bg-surface-muted/40 p-3 text-sm">
      {hasData ? (
        <>
          <p className="mb-2">
            <span className="font-semibold text-ink">{located.advance.artistName}</span> has advance data
            ({advanceDataSummary(located.advance)}). What should happen to it?
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} className={buttonClass} onClick={() => onRemove('clear')}>
              Keep the advance — clear it from the lineup
            </button>
            <button
              type="button"
              disabled={busy}
              className={`${buttonClass} text-accent`}
              onClick={() => onRemove('delete')}
            >
              Delete the advance and its data
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-xs text-ink-muted hover:text-ink sm:min-h-0"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2">
            Remove <span className="font-semibold text-ink">{located.advance.artistName}</span>? No advance
            data has been entered — the advance will be deleted.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} className={buttonClass} onClick={() => onRemove('delete')}>
              Remove
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-xs text-ink-muted hover:text-ink sm:min-h-0"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
