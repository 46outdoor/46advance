/**
 * Per-day schedule notes UI. The Edit view shows an editable block per day (a master note + a note
 * per section, behind a toggle); the Master view shows them read-only — the master note plus each
 * non-empty section note labeled "<Section> Notes:". Notes save on blur. Model in
 * schedule-notes-service.ts.
 */
import { useState } from 'react';
import { SCHEDULE_SECTIONS } from '@/lib/schedules/sections';
import type { DayNoteField, DayNotes } from './schedule-notes-service';

const noteClass = 'w-full rounded border border-line bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-brand';

/** A single note textarea that commits on blur when its text changed. */
function NoteField({ label, value, onSave }: { label: string; value: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block font-semibold text-ink-muted">{label}</span>
      <textarea
        className={noteClass}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== value) onSave(text);
        }}
      />
    </label>
  );
}

/** Editable per-day notes: a master note + a note per section, behind a toggle. */
export function DayNotesEditor({
  notes,
  onSave,
}: {
  notes: DayNotes | undefined;
  onSave: (field: DayNoteField, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-line/60 bg-surface-muted/30 p-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-semibold text-ink-muted hover:text-accent"
      >
        {open ? 'Hide day notes' : 'Day notes'}
      </button>
      {open && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <NoteField label="Master note" value={notes?.master ?? ''} onSave={(t) => onSave('master', t)} />
          {SCHEDULE_SECTIONS.map((s) => (
            <NoteField
              key={s.key}
              label={`${s.label} note`}
              value={notes?.sections[s.key] ?? ''}
              onSave={(t) => onSave(s.key, t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Read-only per-day notes for the master view: the master note + labeled section notes. */
export function DayNotesDisplay({ notes }: { notes: DayNotes | undefined }) {
  const sectionNotes = notes
    ? SCHEDULE_SECTIONS.filter((s) => notes.sections[s.key]).map((s) => ({ label: s.label, text: notes.sections[s.key]! }))
    : [];
  if (!notes?.master && sectionNotes.length === 0) return null;
  return (
    <div className="rounded-lg border border-line/60 bg-surface-muted/30 p-2 text-sm">
      {notes?.master && <p className="whitespace-pre-line text-ink">{notes.master}</p>}
      {sectionNotes.map((n) => (
        <p key={n.label} className="text-xs text-ink-muted">
          <span className="font-semibold">{n.label} Notes:</span> {n.text}
        </p>
      ))}
    </div>
  );
}
