/**
 * Section-aware schedule item form (Phase 12a). The section selector drives which
 * section-specific fields render (from the registry); Show adds an optional advance link,
 * any item can tag a stage. Times are entered as Central wall-clock and converted to UTC.
 */
import { useState, type FormEvent } from 'react';
import {
  SCHEDULE_SECTIONS,
  scheduleSectionDef,
  type ScheduleFieldDef,
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

/** Source fields the form reads from an existing item (nullable per `ScheduleItem`). */
type ScheduleItemSource = Pick<
  ScheduleItem,
  | 'section'
  | 'title'
  | 'customLabel'
  | 'startAt'
  | 'endAt'
  | 'location'
  | 'notes'
  | 'stageId'
  | 'advanceId'
  | 'fields'
  | 'includeInMaster'
>;

/** Defaults for a brand-new item — matches the `?? <default>` fallbacks the form
 * previously inlined, so `null` values from an existing item still coalesce. */
const EMPTY_ITEM: ScheduleItemSource = {
  section: 'production',
  title: '',
  customLabel: '',
  startAt: null,
  endAt: null,
  location: '',
  notes: '',
  stageId: '',
  advanceId: '',
  fields: {},
  includeInMaster: true,
};

/** Initial form state derived from an optional existing item — keeps the nullish
 * defaults out of the component body where they each cost complexity. Merging onto
 * `EMPTY_ITEM` drops `undefined` fields; the remaining `??` still coalesce `null`. */
function initialFormState(initial?: ScheduleItem) {
  const src: ScheduleItemSource = { ...EMPTY_ITEM, ...initial };
  return {
    section: src.section,
    title: src.title,
    customLabel: src.customLabel ?? '',
    start: dateToZonedInput(src.startAt),
    end: dateToZonedInput(src.endAt),
    location: src.location ?? '',
    notes: src.notes ?? '',
    stageId: src.stageId ?? '',
    advanceId: src.advanceId ?? '',
    fields: src.fields,
    includeInMaster: src.includeInMaster,
  } as const;
}

/** A single section-specific field control (select or text/number input). */
function SectionFieldInput({
  field,
  value,
  onChange,
}: {
  field: ScheduleFieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === 'select') {
    return (
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.type === 'number' ? 'number' : 'text'}
      className={inputClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Right-column slot under Stage: either the advance/act link (Show) or Location. */
function AdvanceOrLocationField({
  linksAdvance,
  advances,
  advanceId,
  setAdvanceId,
  location,
  setLocation,
}: {
  linksAdvance: boolean;
  advances: AdvanceOption[];
  advanceId: string;
  setAdvanceId: (value: string) => void;
  location: string;
  setLocation: (value: string) => void;
}) {
  if (linksAdvance) {
    return (
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
    );
  }
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-ink">Location (optional)</span>
      <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
    </label>
  );
}

/** Submit row: save button, optional cancel, and the active error message. */
function FormActions({
  pending,
  submitLabel,
  onCancel,
  message,
}: {
  pending?: boolean;
  submitLabel: string;
  onCancel?: () => void;
  message: string | null;
}) {
  return (
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
      {message && <span className="text-sm text-accent">{message}</span>}
    </div>
  );
}

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
  const [defaults] = useState(() => initialFormState(initial));
  const [section, setSection] = useState<ScheduleSection>(defaults.section);
  const [title, setTitle] = useState(defaults.title);
  const [customLabel, setCustomLabel] = useState(defaults.customLabel);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [location, setLocation] = useState(defaults.location);
  const [notes, setNotes] = useState(defaults.notes);
  const [stageId, setStageId] = useState(defaults.stageId);
  const [advanceId, setAdvanceId] = useState(defaults.advanceId);
  const [fields, setFields] = useState<Record<string, string>>(defaults.fields);
  const [includeInMaster, setIncludeInMaster] = useState(defaults.includeInMaster);
  const [localError, setLocalError] = useState<string | null>(null);

  const def = scheduleSectionDef(section);
  const linksAdvance = def.linksAdvance ?? false;
  const message = localError ?? error ?? null;
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
      <AdvanceOrLocationField
        linksAdvance={linksAdvance}
        advances={advances}
        advanceId={advanceId}
        setAdvanceId={setAdvanceId}
        location={location}
        setLocation={setLocation}
      />

      {linksAdvance && (
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-semibold text-ink">Location (optional)</span>
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      )}

      {def.fields.map((f) => (
        <label key={f.key} className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">{f.label}</span>
          <SectionFieldInput field={f} value={fields[f.key] ?? ''} onChange={(v) => setField(f.key, v)} />
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

      <FormActions pending={pending} submitLabel={submitLabel} onCancel={onCancel} message={message} />
    </form>
  );
}
