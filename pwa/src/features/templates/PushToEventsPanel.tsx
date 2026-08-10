/**
 * Push a template's production content onto events that already exist.
 *
 * Four deliberate stages: pick sections → tick target events → preview the field-level diff →
 * confirm and apply. The push is not reversible, so nothing is pre-selected, there is no
 * "select all", and Apply stays locked until a preview for the *current* selection succeeds
 * (changing sections or targets clears the preview).
 *
 * The callable returns raw field keys — the field registry is client-side only
 * (`@/lib/advances/fields`) — so this panel resolves them to human labels.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { describeCallableError } from '@/lib/errors/callableError';
import { EVENT_PRODUCTION_FIELDS, getDepartmentFields } from '@/lib/advances/fields';
import { listDepartments } from '@/lib/departments/departments-service';
import { listEvents } from '@/lib/events/events-read';
import { PUSH_TARGET_LIMIT, pushTemplateProduction } from '@/lib/templates/template-push-service';
import type { EventRecord } from '@/lib/events/event';
import type {
  PushTemplateProductionOutput,
  TemplatePushChange,
  TemplatePushEventDiff,
  TemplatePushInclude,
} from '@contracts/callables/templates';

const logger = createLogger('TemplatePush');

const ALL_SECTIONS: TemplatePushInclude = { production: true, stageProduction: true };

/** Whole-array units: `from`/`to` are entry counts, and the push replaces the array outright. */
const ARRAY_UNIT_LABELS: Record<string, string> = { contacts: 'Contacts', links: 'Links' };

const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50';
const secondaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded border border-line px-3 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand disabled:opacity-50';

export function PushToEventsPanel({ templateId }: { templateId: string }) {
  const { user, isAdmin, isOrganizer, isProductionDirector } = useAuth();
  const queryClient = useQueryClient();

  const [include, setIncludeState] = useState<TemplatePushInclude>(ALL_SECTIONS);
  const [selected, setSelectedState] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [preview, setPreview] = useState<PushTemplateProductionOutput | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [applied, setApplied] = useState<PushTemplateProductionOutput | null>(null);

  const viewer = user ? { uid: user.uid, isAdmin, isOrganizer, isProductionDirector } : null;
  const eventsQuery = useQuery({
    queryKey: ['events', 'list', viewer?.uid, isAdmin],
    queryFn: () => listEvents(viewer!),
    enabled: !!viewer,
  });
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: listDepartments });

  const departmentName = (id: string) =>
    departmentsQuery.data?.find((d) => d.id === id)?.name ?? id;

  /** Any edit upstream of the preview invalidates it — Apply must never run a stale diff. */
  const resetPreview = () => {
    setPreview(null);
    setConfirming(false);
    setApplied(null);
  };
  const setInclude = (next: TemplatePushInclude) => {
    resetPreview();
    setIncludeState(next);
  };
  const toggleEvent = (eventId: string) => {
    resetPreview();
    setSelectedState((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else if (next.size < PUSH_TARGET_LIMIT) next.add(eventId);
      return next;
    });
  };

  const eventIds = [...selected];

  const previewPush = useMutation({
    mutationFn: () => pushTemplateProduction({ templateId, eventIds, include, dryRun: true }),
    onSuccess: (data) => {
      setPreview(data);
      setConfirming(false);
      setApplied(null);
    },
    onError: (err) => logger.error('Failed to preview the template push', err),
  });

  const applyPush = useMutation({
    mutationFn: () => pushTemplateProduction({ templateId, eventIds, include, dryRun: false }),
    onSuccess: async (data) => {
      setApplied(data);
      setPreview(null);
      setConfirming(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['production'] }),
        queryClient.invalidateQueries({ queryKey: ['stage-production'] }),
      ]);
    },
    onError: (err) => logger.error('Failed to push the template to events', err),
  });

  const events = eventsQuery.data ?? [];
  const nothingToPush = !include.production && !include.stageProduction;
  const canPreview = selected.size > 0 && !nothingToPush && !previewPush.isPending;
  const busy = previewPush.isPending || applyPush.isPending;
  const error = previewPush.error ?? applyPush.error;

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-muted">
        Copy this template's production content onto shows that already exist. Only the production
        record and per-stage house packages travel — roles and schedules are never touched, and no
        stages are created. Writes are live and can't be undone.
      </p>

      <SectionsField include={include} disabled={busy} onChange={setInclude} />

      <TargetEventsField
        templateId={templateId}
        events={events}
        loading={eventsQuery.isLoading}
        selected={selected}
        disabled={busy}
        onToggle={toggleEvent}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonClass}
          disabled={!canPreview}
          onClick={() => previewPush.mutate()}
        >
          {previewPush.isPending ? 'Previewing…' : 'Preview changes'}
        </button>
        {selected.size === 0 && (
          <span className="text-sm text-ink-muted">Pick at least one event to preview.</span>
        )}
        {nothingToPush && selected.size > 0 && (
          <span className="text-sm text-ink-muted">Pick at least one section to push.</span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-accent">
          {describeCallableError(error, 'Could not push this template. Please try again.')}
        </p>
      )}

      {preview && (
        <section className="space-y-3" aria-label="Preview">
          <h3 className="font-display text-lg font-bold text-brand">
            Preview — {changeCount(preview)} change{changeCount(preview) === 1 ? '' : 's'} across{' '}
            {preview.events.length} event{preview.events.length === 1 ? '' : 's'}
          </h3>
          {preview.events.map((diff) => (
            <EventDiffCard key={diff.eventId} diff={diff} departmentName={departmentName} />
          ))}
        </section>
      )}

      <ApplyGate
        count={preview?.events.length ?? selected.size}
        ready={preview !== null}
        confirming={confirming}
        pending={applyPush.isPending}
        onRequest={() => setConfirming(true)}
        onCancel={() => setConfirming(false)}
        onConfirm={() => applyPush.mutate()}
      />

      {applied && (
        <section className="space-y-3" aria-label="Push results">
          {/* Live region so the completed write is announced, without overriding the heading role. */}
          <div role="status">
            <h3 className="font-display text-lg font-bold text-brand">
              Pushed — {changeCount(applied)} change{changeCount(applied) === 1 ? '' : 's'} written
              to {applied.events.length} event{applied.events.length === 1 ? '' : 's'}
            </h3>
          </div>
          {applied.events.map((diff) => (
            <EventDiffCard key={diff.eventId} diff={diff} departmentName={departmentName} written />
          ))}
        </section>
      )}
    </div>
  );
}

function changeCount(output: PushTemplateProductionOutput): number {
  return output.events.reduce((sum, e) => sum + e.changes.length, 0);
}

function SectionsField({
  include,
  disabled,
  onChange,
}: {
  include: TemplatePushInclude;
  disabled: boolean;
  onChange: (next: TemplatePushInclude) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-bold uppercase tracking-wide text-ink-muted">
        Sections to push
      </legend>
      <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={include.production}
          disabled={disabled}
          onChange={(e) => onChange({ ...include, production: e.target.checked })}
        />
        Production record
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={include.stageProduction}
          disabled={disabled}
          onChange={(e) => onChange({ ...include, stageProduction: e.target.checked })}
        />
        Per-stage house packages
      </label>
    </fieldset>
  );
}

function TargetEventsField({
  templateId,
  events,
  loading,
  selected,
  disabled,
  onToggle,
}: {
  templateId: string;
  events: readonly EventRecord[];
  loading: boolean;
  selected: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (eventId: string) => void;
}) {
  const fromTemplate = events.filter((e) => e.templateId === templateId);
  const others = events.filter((e) => e.templateId !== templateId);
  const atLimit = selected.size >= PUSH_TARGET_LIMIT;

  const row = (event: EventRecord) => (
    <label key={event.id} className="flex min-h-11 items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        checked={selected.has(event.id)}
        disabled={disabled || (atLimit && !selected.has(event.id))}
        onChange={() => onToggle(event.id)}
      />
      <span>{event.name}</span>
    </label>
  );

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-bold uppercase tracking-wide text-ink-muted">
        Target events
      </legend>
      <p className="text-sm text-ink-muted">
        {selected.size} of {PUSH_TARGET_LIMIT} selected. Pick each show deliberately — there's no
        select-all, and a push can't be undone.
      </p>
      {atLimit && (
        <p className="text-sm font-semibold text-accent">
          Limit reached: {PUSH_TARGET_LIMIT} events per push. Untick one to swap it out, or run a
          second push.
        </p>
      )}
      {loading && <p className="text-sm text-ink-muted">Loading events…</p>}
      {!loading && events.length === 0 && <p className="text-sm text-ink-muted">No events yet.</p>}
      {fromTemplate.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            From this template
          </h4>
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2">{fromTemplate.map(row)}</div>
        </div>
      )}
      {others.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Other events
          </h4>
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2">{others.map(row)}</div>
        </div>
      )}
    </fieldset>
  );
}

/**
 * The apply stage. Stays disabled until a preview for the current selection has come back, then
 * takes a second, explicit confirmation — this writes to live shows.
 */
function ApplyGate({
  count,
  ready,
  confirming,
  pending,
  onRequest,
  onCancel,
  onConfirm,
}: {
  count: number;
  ready: boolean;
  confirming: boolean;
  pending: boolean;
  onRequest: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = `${count} event${count === 1 ? '' : 's'}`;
  if (!confirming) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonClass}
          disabled={!ready || pending}
          onClick={onRequest}
        >
          Apply to {label}
        </button>
        {!ready && <span className="text-sm text-ink-muted">Preview first, then apply.</span>}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-accent p-3">
      <p className="text-sm font-semibold text-ink">
        This writes to {label} for real. Live shows change immediately and there's no undo.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonClass} disabled={pending} onClick={onConfirm}>
          {pending ? 'Pushing…' : 'Yes, push now'}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function EventDiffCard({
  diff,
  departmentName,
  written = false,
}: {
  diff: TemplatePushEventDiff;
  departmentName: (id: string) => string;
  written?: boolean;
}) {
  const groups = groupChanges(diff.changes, departmentName);
  return (
    <article className="rounded-lg border border-line p-3">
      <h4 className="font-display text-base font-bold text-brand">{diff.eventName}</h4>
      {diff.changes.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No changes — this event already matches the template.
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {groups.map((group) => (
            <div key={group.id}>
              <h5 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {group.title}
              </h5>
              <ul className="space-y-0.5">
                {group.changes.map((change) => (
                  <li key={`${group.id}-${change.key}`} className="text-sm text-ink">
                    <ChangeLine change={change} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {diff.skippedStages.length > 0 && (
        <p className="mt-2 text-sm text-ink-muted">
          Skipped stages: {diff.skippedStages.join(', ')} — no stage with that name on this event,
          and a push never creates one{written ? '' : ', so nothing will be written there'}.
        </p>
      )}
    </article>
  );
}

function ChangeLine({ change }: { change: TemplatePushChange }) {
  const label = changeLabel(change);
  if (ARRAY_UNIT_LABELS[change.key]) {
    return (
      <span>
        <span className="font-semibold">{label}:</span> {change.from} → {change.to} (replaced)
      </span>
    );
  }
  return (
    <span>
      <span className="font-semibold">{label}:</span> {displayValue(change.from)} →{' '}
      {displayValue(change.to)}
    </span>
  );
}

/**
 * Raw key → human label. Event-scope keys come from `EVENT_PRODUCTION_FIELDS`; stage-scope keys
 * from the change's department in the `production` context (the house-package field set, not the
 * per-artist `advance` one). Unknown keys fall back to the raw key so a registry gap still reads.
 */
function changeLabel(change: TemplatePushChange): string {
  const arrayUnit = ARRAY_UNIT_LABELS[change.key];
  if (arrayUnit) return arrayUnit;
  const fields =
    change.scope === 'stageProduction' && change.departmentId
      ? getDepartmentFields(change.departmentId, 'production')
      : EVENT_PRODUCTION_FIELDS;
  return fields.find((f) => f.key === change.key)?.label ?? change.key;
}

function displayValue(value: string): string {
  return value.trim() === '' ? '(unset)' : value;
}

interface ChangeGroup {
  id: string;
  title: string;
  changes: TemplatePushChange[];
}

/** Group a diff by section so a stage's department reads as one block, not a flat key list. */
function groupChanges(
  changes: readonly TemplatePushChange[],
  departmentName: (id: string) => string,
): ChangeGroup[] {
  const groups = new Map<string, ChangeGroup>();
  for (const change of changes) {
    const id =
      change.scope === 'eventProduction'
        ? 'eventProduction'
        : `stage:${change.stageName ?? ''}:${change.departmentId ?? ''}`;
    const existing = groups.get(id);
    if (existing) {
      existing.changes.push(change);
      continue;
    }
    const title =
      change.scope === 'eventProduction'
        ? 'Production record'
        : `${change.stageName ?? 'Stage'} — ${departmentName(change.departmentId ?? '')}`;
    groups.set(id, { id, title, changes: [change] });
  }
  return [...groups.values()];
}
