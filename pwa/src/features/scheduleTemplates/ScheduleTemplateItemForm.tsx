/**
 * Per-item form for a schedule template ("blueprint" row). Unlike a real schedule item it uses a
 * relative day + wall-clock time (resolved on import) and a stage referenced by name. Show items
 * get a lineup slot. Section-specific fields are intentionally left to the per-event schedule.
 */
import { useState, type FormEvent } from 'react';
import { SCHEDULE_SECTIONS, scheduleSectionDef, type ScheduleSection } from '@/lib/schedules/sections';
import type { ScheduleTemplateItem } from '@/lib/schedules/scheduleTemplate';
import { SlotSelect } from '@/components/lineup/SlotSelect';

const inputClass = 'w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand';

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
  stageName: string;
  slot: number | null;
  location: string;
  notes: string;
  includeInMaster: boolean;
  linksAdvance: boolean;
  fields: Record<string, string>;
}): ScheduleTemplateItemDraft {
  return {
    section: s.section,
    title: s.title.trim(),
    customLabel: s.section === 'custom' ? s.customLabel.trim() || null : null,
    dayOffset: s.dayOffset,
    timeOfDay: s.timeOfDay || null,
    endTimeOfDay: s.endTimeOfDay || null,
    stageName: s.stageName.trim() || null,
    slot: s.linksAdvance ? s.slot : null,
    location: s.location.trim() || null,
    notes: s.notes.trim() || null,
    fields: s.fields,
    includeInMaster: s.includeInMaster,
  };
}

/** Form defaults from an optional existing item — keeps the nullish coalescing out of the
 * component body (each `?.`/`??` costs complexity). */
function initialState(initial?: ScheduleTemplateItem) {
  return {
    section: (initial?.section ?? 'production') as ScheduleSection,
    title: initial?.title ?? '',
    customLabel: initial?.customLabel ?? '',
    dayOffset: initial?.dayOffset ?? 0,
    timeOfDay: initial?.timeOfDay ?? '',
    endTimeOfDay: initial?.endTimeOfDay ?? '',
    stageName: initial?.stageName ?? '',
    slot: initial?.slot ?? null,
    location: initial?.location ?? '',
    notes: initial?.notes ?? '',
    includeInMaster: initial?.includeInMaster ?? true,
    fields: initial?.fields ?? {},
  };
}

export function ScheduleTemplateItemForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ScheduleTemplateItem;
  submitLabel: string;
  onSubmit: (item: ScheduleTemplateItemDraft) => void;
  onCancel: () => void;
}) {
  const [d] = useState(() => initialState(initial));
  const [section, setSection] = useState<ScheduleSection>(d.section);
  const [title, setTitle] = useState(d.title);
  const [customLabel, setCustomLabel] = useState(d.customLabel);
  const [dayOffset, setDayOffset] = useState(d.dayOffset);
  const [timeOfDay, setTimeOfDay] = useState(d.timeOfDay);
  const [endTimeOfDay, setEndTimeOfDay] = useState(d.endTimeOfDay);
  const [stageName, setStageName] = useState(d.stageName);
  const [slot, setSlot] = useState<number | null>(d.slot);
  const [location, setLocation] = useState(d.location);
  const [notes, setNotes] = useState(d.notes);
  const [includeInMaster, setIncludeInMaster] = useState(d.includeInMaster);
  const [error, setError] = useState<string | null>(null);

  const linksAdvance = scheduleSectionDef(section).linksAdvance ?? false;

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
        dayOffset,
        timeOfDay,
        endTimeOfDay,
        stageName,
        slot,
        location,
        notes,
        includeInMaster,
        linksAdvance,
        fields: d.fields,
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

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Day</span>
        <input
          type="number"
          min={1}
          className={inputClass}
          value={dayOffset + 1}
          onChange={(e) => setDayOffset(Math.max(0, Number(e.target.value) - 1))}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Start</span>
          <input type="time" className={inputClass} value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">End</span>
          <input type="time" className={inputClass} value={endTimeOfDay} onChange={(e) => setEndTimeOfDay(e.target.value)} />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Stage (matches by name, optional)</span>
        <input className={inputClass} value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="e.g. Main Stage" />
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
