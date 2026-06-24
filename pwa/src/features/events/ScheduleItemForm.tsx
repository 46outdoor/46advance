/**
 * Section-aware schedule item form (Phase 12a). The section selector drives which
 * section-specific fields render (from the registry); Show adds an optional advance link,
 * any item can tag a stage. Times are entered as Central wall-clock and converted to UTC.
 */
import { useState, type FormEvent } from 'react';
import {
  SCHEDULE_SECTIONS,
  scheduleSectionDef,
  type ScheduleSection,
} from '@/lib/schedules/sections';
import {
  scheduleItemInputSchema,
  type ScheduleItem,
  type ScheduleItemInput,
} from '@/lib/schedules/scheduleItem';
import { dateToZonedInput, zonedInputToDate } from '@/lib/dates/timezone';

export interface StageOption {
  id: string;
  name: string;
}
export interface AdvanceOption {
  id: string;
  label: string;
}

interface Props {
  initial?: ScheduleItem;
  stages: StageOption[];
  advances: AdvanceOption[];
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (input: ScheduleItemInput) => void;
  onCancel?: () => void;
}

const inputClass = 'w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand';

export function ScheduleItemForm({
  initial,
  stages,
  advances,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const [section, setSection] = useState<ScheduleSection>(initial?.section ?? 'production');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [customLabel, setCustomLabel] = useState(initial?.customLabel ?? '');
  const [start, setStart] = useState(dateToZonedInput(initial?.startAt ?? null));
  const [end, setEnd] = useState(dateToZonedInput(initial?.endAt ?? null));
  const [location, setLocation] = useState(initial?.location ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [stageId, setStageId] = useState(initial?.stageId ?? '');
  const [advanceId, setAdvanceId] = useState(initial?.advanceId ?? '');
  const [fields, setFields] = useState<Record<string, string>>(initial?.fields ?? {});
  const [includeInMaster, setIncludeInMaster] = useState(initial?.includeInMaster ?? true);
  const [localError, setLocalError] = useState<string | null>(null);

  const def = scheduleSectionDef(section);
  const setField = (key: string, value: string) => setFields((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const sectionFields: Record<string, string> = {};
    for (const f of def.fields) {
      const v = fields[f.key]?.trim();
      if (v) sectionFields[f.key] = v;
    }
    const parsed = scheduleItemInputSchema.safeParse({
      section,
      customLabel: section === 'custom' ? customLabel.trim() || undefined : undefined,
      title,
      startAt: zonedInputToDate(start),
      endAt: zonedInputToDate(end),
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      stageId: stageId || undefined,
      advanceId: def.linksAdvance ? advanceId || undefined : undefined,
      fields: sectionFields,
      includeInMaster,
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Invalid input.');
      return;
    }
    setLocalError(null);
    onSubmit(parsed.data);
  };

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Section</span>
        <select className={inputClass} value={section} onChange={(e) => setSection(e.target.value as ScheduleSection)}>
          {SCHEDULE_SECTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {section === 'custom' ? (
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Custom section name</span>
          <input className={inputClass} value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g. Catering" />
        </label>
      ) : (
        <div className="hidden sm:block" />
      )}

      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Title</span>
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Load-in" />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Start (Central)</span>
        <input type="datetime-local" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">End (Central, optional)</span>
        <input type="datetime-local" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Stage (optional)</span>
        <select className={inputClass} value={stageId} onChange={(e) => setStageId(e.target.value)}>
          <option value="">Event-wide</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {def.linksAdvance ? (
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Advance / act (optional)</span>
          <select className={inputClass} value={advanceId} onChange={(e) => setAdvanceId(e.target.value)}>
            <option value="">None</option>
            {advances.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Location (optional)</span>
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      )}

      {def.linksAdvance && (
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-semibold text-ink">Location (optional)</span>
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      )}

      {def.fields.map((f) => (
        <label key={f.key} className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">{f.label}</span>
          {f.type === 'select' ? (
            <select className={inputClass} value={fields[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)}>
              <option value="">—</option>
              {f.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={f.type === 'number' ? 'number' : 'text'}
              className={inputClass}
              value={fields[f.key] ?? ''}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          )}
        </label>
      ))}

      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Notes (optional)</span>
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={includeInMaster} onChange={(e) => setIncludeInMaster(e.target.checked)} />
        Show in master schedule
      </label>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-ink-muted hover:text-ink">
            Cancel
          </button>
        )}
        {(localError || error) && <span className="text-sm text-accent">{localError ?? error}</span>}
      </div>
    </form>
  );
}
