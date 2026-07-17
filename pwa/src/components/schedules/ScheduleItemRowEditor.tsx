/**
 * Inline edit row for the schedule grid (MPA-style global edit mode). Cell inputs sit on
 * the shared column template — Start | End | Duration (derived) | Type | Item |
 * Description — with an expanded area underneath for the type's sub-fields: custom
 * label, stage sub-type, per-type detail fields, crew lines (labor), estimated-end and
 * push-to-calendar flags, and delete. The row keeps a local draft and commits when
 * focus leaves it (save-on-blur), normalizing to the selected type on the way out.
 */
import { useState, type FocusEvent } from 'react';
import { scheduleItemTypeDef, SCHEDULE_ITEM_TYPES, type ScheduleItemType } from '@/lib/schedules/itemTypes';
import { itemDurationLabel, type ScheduleDayItem } from '@/lib/schedules/scheduleDay';
import { SectionFieldInput } from './SectionFieldInput';
import { CrewLinesEditor } from './CrewLines';

export interface StageOption {
  id: string;
  name: string;
}

const inputClass =
  'min-h-11 w-full rounded border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-brand sm:min-h-0';

/** Normalize a draft to its selected type: prune fields the type doesn't declare, drop
 * stage/crew/custom-label where they don't apply, and never commit a blank Item name
 * (reverts to the last saved name). */
function normalizeDraft(draft: ScheduleDayItem, saved: ScheduleDayItem): ScheduleDayItem {
  const def = scheduleItemTypeDef(draft.type);
  const fields: Record<string, string> = {};
  for (const f of def.fields) {
    const v = draft.fields[f.key]?.trim();
    if (v) fields[f.key] = v;
  }
  return {
    ...draft,
    item: draft.item.trim() || saved.item,
    customLabel: draft.type === 'custom' ? draft.customLabel : null,
    stageId: def.hasStage ? draft.stageId : null,
    fields,
    crew: def.hasCrew ? draft.crew : [],
    endEstimated: draft.endTime ? draft.endEstimated : false,
  };
}

export function ScheduleItemRowEditor({
  item,
  stages,
  crewTypes,
  onCommit,
  onDelete,
}: {
  item: ScheduleDayItem;
  stages: readonly StageOption[];
  crewTypes: readonly string[];
  onCommit: (item: ScheduleDayItem) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(item);
  const def = scheduleItemTypeDef(draft.type);
  const patch = (p: Partial<ScheduleDayItem>) => setDraft((d) => ({ ...d, ...p }));

  const commitOnLeave = (e: FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
    const next = normalizeDraft(draft, item);
    setDraft(next);
    if (JSON.stringify(next) !== JSON.stringify(item)) onCommit(next);
  };

  return (
    <div className="space-y-2 px-3 py-2" onBlur={commitOnLeave}>
      <div className="flex flex-wrap items-center gap-2 sm:grid sm:grid-cols-[4.5rem_4.5rem_4.5rem_5.5rem_minmax(8rem,1fr)_minmax(10rem,1.4fr)] sm:gap-x-3">
        <input
          type="time"
          className={inputClass}
          value={draft.startTime ?? ''}
          aria-label="Start time"
          onChange={(e) => patch({ startTime: e.target.value || null })}
        />
        <input
          type="time"
          className={inputClass}
          value={draft.endTime ?? ''}
          aria-label="End time"
          onChange={(e) => patch({ endTime: e.target.value || null })}
        />
        <span className="self-center text-sm text-ink-muted tabular-nums">{itemDurationLabel(draft) ?? '—'}</span>
        <select
          className={inputClass}
          value={draft.type}
          aria-label="Type"
          onChange={(e) => patch({ type: e.target.value as ScheduleItemType })}
        >
          {SCHEDULE_ITEM_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          className={inputClass}
          value={draft.item}
          aria-label="Item"
          placeholder="e.g. Load-In Call or {artist 1} set"
          onChange={(e) => patch({ item: e.target.value })}
        />
        <input
          className={inputClass}
          value={draft.description ?? ''}
          aria-label="Description"
          placeholder="Description"
          onChange={(e) => patch({ description: e.target.value || null })}
        />
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pl-0 sm:pl-[14.5rem]">
        {draft.type === 'custom' && (
          <label className="block text-xs">
            <span className="mb-0.5 block font-semibold text-ink">Type name</span>
            <input
              className={`${inputClass} w-40`}
              value={draft.customLabel ?? ''}
              placeholder="e.g. Catering"
              onChange={(e) => patch({ customLabel: e.target.value || null })}
            />
          </label>
        )}
        {def.hasStage && (
          <label className="block text-xs">
            <span className="mb-0.5 block font-semibold text-ink">Stage</span>
            <select
              className={`${inputClass} w-40`}
              value={draft.stageId ?? ''}
              onChange={(e) => patch({ stageId: e.target.value || null })}
            >
              <option value="">Event-wide</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {def.fields.map((f) => (
          <label key={f.key} className="block text-xs">
            <span className="mb-0.5 block font-semibold text-ink">{f.label}</span>
            <SectionFieldInput
              field={f}
              value={draft.fields[f.key] ?? ''}
              className={`${inputClass} w-40`}
              onChange={(v) => patch({ fields: { ...draft.fields, [f.key]: v } })}
            />
          </label>
        ))}
        <label className="inline-flex min-h-11 items-center gap-1.5 text-xs text-ink-muted sm:min-h-0">
          <input
            type="checkbox"
            checked={draft.endEstimated}
            disabled={!draft.endTime}
            onChange={(e) => patch({ endEstimated: e.target.checked })}
          />
          Estimated end
        </label>
        <label className="inline-flex min-h-11 items-center gap-1.5 text-xs text-ink-muted sm:min-h-0">
          <input
            type="checkbox"
            checked={draft.pushToCalendar}
            onChange={(e) => patch({ pushToCalendar: e.target.checked })}
          />
          Push to calendar
        </label>
        <button
          type="button"
          className="inline-flex min-h-11 items-center text-xs text-ink-muted hover:text-accent sm:min-h-0"
          onClick={onDelete}
        >
          Delete item
        </button>
      </div>

      {def.hasCrew && (
        <div className="pl-0 sm:pl-[14.5rem]">
          <CrewLinesEditor
            crew={draft.crew}
            crewTypes={crewTypes}
            inputClass={inputClass}
            onChange={(crew) => patch({ crew })}
          />
        </div>
      )}
    </div>
  );
}
