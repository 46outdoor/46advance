/**
 * Per-item form for a schedule template ("blueprint" row). Unlike a real schedule item it uses a
 * relative day + wall-clock time (resolved on import) and a stage referenced by name. Show items
 * get a lineup slot; section-specific fields (e.g. labor call type/quantity) render from the
 * section registry, same as the per-event schedule form.
 */
import { useState, type FormEvent } from 'react';
import { SCHEDULE_SECTIONS, scheduleSectionDef, type ScheduleSection } from '@/lib/schedules/sections';
import type { ScheduleTemplateItem } from '@/lib/schedules/scheduleTemplate';
import { SlotSelect } from '@/components/lineup/SlotSelect';
import { SectionFieldInput } from '@/components/schedules/SectionFieldInput';

const inputClass = 'w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand';

/** Stage-name options: the canonical names from event templates, always including the item's
 * current name so editing never drops a legacy/one-off value. */
function stageOptions(names: readonly string[], current: string): string[] {
  const set = new Set(names);
  if (current) set.add(current);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export type ScheduleTemplateItemDraft = Omit<ScheduleTemplateItem, 'id' | 'order'>;

/** Build a normalized draft from the form's raw fields (keeps the `|| null` coalescing out of
 * the component body, where each branch costs complexity). */
function toDraft(s: {
  section: ScheduleSection;
  title: string;
  customLabel: string;
  dayOffset: number;
  timeOfDay: string;
  endTimeOfDay: string;
  endEstimated: boolean;
  stageName: string;
  slot: number | null;
  location: string;
  notes: string;
  includeInMaster: boolean;
  linksAdvance: boolean;
  fields: Record<string, string>;
}): ScheduleTemplateItemDraft {
  const sectionFields: Record<string, string> = {};
  for (const f of scheduleSectionDef(s.section).fields) {
    const v = s.fields[f.key]?.trim();
    if (v) sectionFields[f.key] = v;
  }
  return {
    section: s.section,
    title: s.title.trim(),
    customLabel: s.section === 'custom' ? s.customLabel.trim() || null : null,
    dayOffset: s.dayOffset,
    timeOfDay: s.timeOfDay || null,
    endTimeOfDay: s.endTimeOfDay || null,
    endEstimated: s.endTimeOfDay ? s.endEstimated : false,
    stageName: s.stageName.trim() || null,
    slot: s.linksAdvance ? s.slot : null,
    location: s.location.trim() || null,
    notes: s.notes.trim() || null,
    fields: sectionFields,
    includeInMaster: s.includeInMaster,
  };
}

/** Form state from an existing item — nullable strings coalesce to ''. */
function fromItem(item: ScheduleTemplateItem) {
  return {
    section: item.section,
    title: item.title,
    customLabel: item.customLabel ?? '',
    timeOfDay: item.timeOfDay ?? '',
    endTimeOfDay: item.endTimeOfDay ?? '',
    endEstimated: item.endEstimated,
    stageName: item.stageName ?? '',
    slot: item.slot,
    location: item.location ?? '',
    notes: item.notes ?? '',
    includeInMaster: item.includeInMaster,
    fields: item.fields,
  };
}

/** Blank form state for a new item starting on `defaultSection`. */
function emptyState(defaultSection: ScheduleSection): ReturnType<typeof fromItem> {
  return {
    section: defaultSection,
    title: '',
    customLabel: '',
    timeOfDay: '',
    endTimeOfDay: '',
    endEstimated: false,
    stageName: '',
    slot: null,
    location: '',
    notes: '',
    includeInMaster: true,
    fields: {},
  };
}

/** Form defaults from an optional existing item — the split into fromItem/emptyState keeps
 * the nullish coalescing per branch under the complexity gate. */
function initialState(initial: ScheduleTemplateItem | undefined, defaultSection: ScheduleSection = 'production') {
  return initial ? fromItem(initial) : emptyState(defaultSection);
}

export function ScheduleTemplateItemForm({
  initial,
  dayOffset,
  defaultSection,
  stageNames = [],
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ScheduleTemplateItem;
  /** Day a new item is created on — the form itself no longer picks a day (the editor's
   * day groups own that); editing keeps the item's own day. */
  dayOffset?: number;
  /** Section a new item starts on (ignored when editing an existing item). */
  defaultSection?: ScheduleSection;
  /** Stage names offered in the Stage dropdown (from the event templates' stages). */
  stageNames?: readonly string[];
  submitLabel: string;
  onSubmit: (item: ScheduleTemplateItemDraft) => void;
  onCancel: () => void;
}) {
  const [d] = useState(() => initialState(initial, defaultSection));
  const [section, setSection] = useState<ScheduleSection>(d.section);
  const [title, setTitle] = useState(d.title);
  const [customLabel, setCustomLabel] = useState(d.customLabel);
  const [timeOfDay, setTimeOfDay] = useState(d.timeOfDay);
  const [endTimeOfDay, setEndTimeOfDay] = useState(d.endTimeOfDay);
  const [endEstimated, setEndEstimated] = useState(d.endEstimated);
  const [stageName, setStageName] = useState(d.stageName);
  const [slot, setSlot] = useState<number | null>(d.slot);
  const [location, setLocation] = useState(d.location);
  const [notes, setNotes] = useState(d.notes);
  const [fields, setFields] = useState<Record<string, string>>(d.fields);
  const [includeInMaster, setIncludeInMaster] = useState(d.includeInMaster);
  const [error, setError] = useState<string | null>(null);

  const def = scheduleSectionDef(section);
  const linksAdvance = def.linksAdvance ?? false;
  const setField = (key: string, value: string) => setFields((p) => ({ ...p, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    onSubmit(
      toDraft({
        section,
        title,
        customLabel,
        dayOffset: initial?.dayOffset ?? dayOffset ?? 0,
        timeOfDay,
        endTimeOfDay,
        endEstimated,
        stageName,
        slot,
        location,
        notes,
        includeInMaster,
        linksAdvance,
        fields,
      }),
    );
  };

  return (
    <form className="grid gap-3 rounded-lg border border-line bg-surface-muted/40 p-3 sm:grid-cols-2" onSubmit={submit}>
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
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Doors" />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Start</span>
          <input type="time" className={inputClass} value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
        </label>
        <div className="text-sm">
          <label className="block">
            <span className="mb-1 block font-semibold text-ink">End</span>
            <input type="time" className={inputClass} value={endTimeOfDay} onChange={(e) => setEndTimeOfDay(e.target.value)} />
          </label>
          <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <input type="checkbox" checked={endEstimated} onChange={(e) => setEndEstimated(e.target.checked)} />
            Estimated end time
          </label>
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Stage (matches by name, optional)</span>
        <select className={inputClass} value={stageName} onChange={(e) => setStageName(e.target.value)}>
          <option value="">Event-wide</option>
          {stageOptions(stageNames, stageName).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {linksAdvance ? (
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Slot (auto-fills the artist)</span>
          <SlotSelect slot={slot} onChange={setSlot} selectClass={inputClass} />
        </label>
      ) : (
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Location (optional)</span>
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      )}

      {def.fields.map((f) => (
        <label key={f.key} className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">{f.label}</span>
          <SectionFieldInput field={f} value={fields[f.key] ?? ''} className={inputClass} onChange={(v) => setField(f.key, v)} />
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
        <button type="submit" className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-ink-muted hover:text-ink">
          Cancel
        </button>
        {error && <span className="text-sm text-accent">{error}</span>}
      </div>
    </form>
  );
}
