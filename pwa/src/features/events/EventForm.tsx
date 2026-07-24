import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { describeCallableError } from '@/lib/errors/callableError';
import { pickDriveFolder } from '@/lib/google';
import {
  composeEventName,
  EVENT_STATUSES,
  eventInputSchema,
  type EventInput,
  type EventStatus,
} from '@/lib/events/event';
import { festivalsKey, listFestivals } from '@/lib/festivals/festivals-service';
import type { FestivalRecord } from '@/lib/festivals/festival';
import { defaultEventSlug, slugify } from '@/lib/events/slug';
import type { DepartmentRecord } from '@/lib/departments/department';
import {
  APP_TIME_ZONE,
  COMMON_TIME_ZONES,
  dayKeyToInstant,
  zonedDayKey,
} from '@/lib/dates/timezone';

interface EventFormProps {
  initial?: {
    name: string;
    startDate: Date | null;
    endDate: Date | null;
    loadInDays?: number;
    loadOutDays?: number;
    timeZone?: string;
    venue: string | null;
    shortCode?: string | null;
    festivalId?: string | null;
    location?: string | null;
    status?: EventStatus;
    departmentIds?: string[];
    bookingLabel?: string | null;
    slug?: string | null;
    driveFolderId?: string | null;
    driveFolderName?: string | null;
  };
  /** Available departments to enable. */
  departments: DepartmentRecord[];
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  /** Show the status selector (edit mode); on create the event starts as draft. */
  showStatus?: boolean;
  onSubmit: (input: EventInput) => void;
  onCancel?: () => void;
}

const inputClass = 'w-full rounded border border-line px-3 py-2 outline-none focus:border-brand';
const logger = createLogger('EventForm');

/** Drive-folder link field: pick / change / unlink the event documents folder. */
function DriveFolderField({
  folder,
  onChange,
  onError,
}: {
  folder: { id: string; name: string } | null;
  onChange: (folder: { id: string; name: string } | null) => void;
  onError: (message: string) => void;
}) {
  const pick = () => {
    void pickDriveFolder()
      .then((picked) => {
        if (picked) onChange(picked);
      })
      .catch((e) => {
        logger.error('Drive folder picker failed', e);
        onError(describeCallableError(e, 'Could not open the Drive picker. Please try again.'));
      });
  };
  return (
    <div className="block text-sm sm:col-span-2">
      <span className="mb-1 block font-semibold text-ink">Event documents folder (optional)</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-muted">{folder ? folder.name : 'No Drive folder linked.'}</span>
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded border border-line px-3 py-1 text-xs font-semibold text-ink transition-colors hover:border-accent hover:text-accent sm:min-h-0"
          onClick={pick}
        >
          {folder ? 'Change folder' : 'Choose folder'}
        </button>
        {folder && (
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-xs text-ink-muted hover:text-accent sm:min-h-0"
            onClick={() => onChange(null)}
          >
            Unlink
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">
        New event documents upload into this folder. Share it with the document viewer account so
        every member can open files in-app.
      </p>
    </div>
  );
}

/** Slug field state: tracks the booking label / name / year until the user edits it directly. */
function useEventSlug(
  initialSlug: string | null | undefined,
  name: string,
  bookingLabel: string,
  start: string,
  timeZone: string,
) {
  const [slug, setSlug] = useState(initialSlug ?? '');
  const [touched, setTouched] = useState(Boolean(initialSlug));
  const value = touched
    ? slug
    : defaultEventSlug(bookingLabel.trim() || null, name, dayKeyToInstant(start, timeZone));
  return {
    value,
    onChange: (next: string) => {
      setSlug(next);
      setTouched(true);
    },
  };
}

/** Initial event-date form values, derived in the event's zone (F-6). Hoisted out of the
 *  component so its optional-chaining branches don't count against EventForm's complexity. */
function initialEventDates(
  initial: { startDate: Date | null; endDate: Date | null; timeZone?: string } | undefined,
): { timeZone: string; start: string; end: string } {
  const timeZone = initial?.timeZone ?? APP_TIME_ZONE;
  return {
    timeZone,
    start: zonedDayKey(initial?.startDate ?? null, timeZone),
    end: zonedDayKey(initial?.endDate ?? null, timeZone),
  };
}

interface EventFormValues {
  name: string;
  start: string;
  end: string;
  loadInDays: number;
  loadOutDays: number;
  timeZone: string;
  venue: string;
  shortCode: string;
  festivalId: string;
  location: string;
  driveFolder: { id: string; name: string } | null;
  departmentIds: string[];
  bookingLabel: string;
  slug: string;
  status: EventStatus;
  showStatus: boolean;
}

/** Build + validate the event input from the form's values (kept out of the component so its
 *  many optional-field branches don't count against EventForm's complexity). */
function parseEventForm(v: EventFormValues) {
  return eventInputSchema.safeParse({
    name: v.name,
    startDate: dayKeyToInstant(v.start, v.timeZone),
    endDate: dayKeyToInstant(v.end, v.timeZone),
    loadInDays: v.loadInDays,
    loadOutDays: v.loadOutDays,
    timeZone: v.timeZone,
    venue: v.venue.trim() || undefined,
    shortCode: v.shortCode.trim() || undefined,
    festivalId: v.festivalId,
    location: v.location.trim() || undefined,
    driveFolderId: v.driveFolder?.id ?? null,
    driveFolderName: v.driveFolder?.name ?? null,
    departmentIds: v.departmentIds,
    bookingLabel: v.bookingLabel.trim() || undefined,
    slug: v.slug.trim() || undefined,
    ...(v.showStatus ? { status: v.status } : {}),
  });
}

/** Initial linked-folder state from an event, or null. Hoisted out of EventForm for complexity. */
function initialDriveFolder(
  initial: { driveFolderId?: string | null; driveFolderName?: string | null } | undefined,
): { id: string; name: string } | null {
  return initial?.driveFolderId
    ? { id: initial.driveFolderId, name: initial.driveFolderName ?? 'Drive folder' }
    : null;
}

/** The composed event name from the form's festival + dates + location; falls back to the stored
 *  name for a legacy event with no festival picked yet. Extracted to keep EventForm's complexity down. */
function resolveFormName(
  festivals: readonly FestivalRecord[],
  festivalId: string,
  start: string,
  location: string,
  timeZone: string,
  fallbackName: string,
): string {
  const festival = festivals.find((f) => f.id === festivalId);
  if (!festival) return fallbackName;
  return composeEventName(
    festival.name,
    start ? dayKeyToInstant(start, timeZone) : null,
    location,
    timeZone,
  );
}

/** Festival picker + Location + the read-only, auto-composed event name. */
function FestivalNameFields({
  festivalId,
  location,
  festivals,
  loading,
  name,
  onFestival,
  onLocation,
}: {
  festivalId: string;
  location: string;
  festivals: readonly FestivalRecord[];
  loading: boolean;
  name: string;
  onFestival: (id: string) => void;
  onLocation: (location: string) => void;
}) {
  return (
    <>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Festival</span>
        <select
          className={inputClass}
          value={festivalId}
          onChange={(e) => onFestival(e.target.value)}
        >
          <option value="">Choose a festival…</option>
          {festivals.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Location</span>
        <input
          className={inputClass}
          value={location}
          onChange={(e) => onLocation(e.target.value)}
          placeholder="Ashland"
        />
      </label>
      <div className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Event name</span>
        <p className="rounded border border-line/60 bg-surface-muted/30 px-3 py-2 text-ink-muted">
          {name || 'Pick a festival to build the name'}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          Auto-built from festival + year + location.
          {festivals.length === 0 && !loading && ' Add festivals in Admin → Festivals first.'}
        </p>
      </div>
    </>
  );
}

/** The enabled-departments checkboxes (extracted to keep EventForm's complexity down). */
function DepartmentCheckboxes({
  departments,
  deptIds,
  onToggle,
}: {
  departments: DepartmentRecord[];
  deptIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="block text-sm sm:col-span-2">
      <legend className="mb-1 font-semibold text-ink">Departments</legend>
      {departments.length === 0 ? (
        <p className="text-ink-muted">No departments configured yet (seed them in Admin).</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {departments.map((d) => (
            <label key={d.id} className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={deptIds.has(d.id)} onChange={() => onToggle(d.id)} />
              {d.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** Create/edit form for an event. Validates with eventInputSchema before submitting. */
export function EventForm({
  initial,
  departments,
  submitLabel,
  pending,
  error,
  showStatus,
  onSubmit,
  onCancel,
}: EventFormProps) {
  // Event dates are shown + collected in the EVENT's zone (not the browser's), so the same calendar
  // day is stored and read regardless of the editor's timezone (F-6). Date-only → event-zone midnight.
  const dates = initialEventDates(initial);
  const festivalsQuery = useQuery({ queryKey: festivalsKey(), queryFn: listFestivals });
  const festivals = festivalsQuery.data ?? [];
  const [festivalId, setFestivalId] = useState(initial?.festivalId ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [start, setStart] = useState(dates.start);
  const [end, setEnd] = useState(dates.end);
  const [loadInDays, setLoadInDays] = useState(() => initial?.loadInDays ?? 0);
  const [loadOutDays, setLoadOutDays] = useState(() => initial?.loadOutDays ?? 0);
  const [timeZone, setTimeZone] = useState(dates.timeZone);
  const [venue, setVenue] = useState(initial?.venue ?? '');
  const [shortCode, setShortCode] = useState(initial?.shortCode ?? '');
  const [driveFolder, setDriveFolder] = useState(initialDriveFolder(initial));
  const [bookingLabel, setBookingLabel] = useState(initial?.bookingLabel ?? '');
  const [status, setStatus] = useState<EventStatus>(initial?.status ?? 'draft');
  // Default: edit keeps the event's departments; create enables all available.
  const [deptIds, setDeptIds] = useState<Set<string>>(
    () => new Set(initial?.departmentIds ?? departments.map((d) => d.id)),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const toggleDept = (id: string) =>
    setDeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // The event name is composed from the picked festival + year + location (denormalized to
  // `name`). Legacy events with no festival keep their stored name until one is picked.
  const name = resolveFormName(
    festivals,
    festivalId,
    start,
    location,
    timeZone,
    initial?.name ?? '',
  );

  const slugField = useEventSlug(initial?.slug, name, bookingLabel, start, timeZone);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!festivalId) {
      setLocalError('Choose a festival.');
      return;
    }
    const parsed = parseEventForm({
      name,
      start,
      end,
      loadInDays,
      loadOutDays,
      timeZone,
      venue,
      shortCode,
      festivalId,
      location,
      driveFolder,
      departmentIds: departments.filter((d) => deptIds.has(d.id)).map((d) => d.id),
      bookingLabel,
      slug: slugField.value,
      status,
      showStatus: showStatus ?? false,
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Invalid input.');
      return;
    }
    setLocalError(null);
    onSubmit(parsed.data);
  };

  return (
    <form className="grid gap-3 sm:grid-cols-2 sm:items-end" onSubmit={submit}>
      <FestivalNameFields
        festivalId={festivalId}
        location={location}
        festivals={festivals}
        loading={festivalsQuery.isLoading}
        name={name}
        onFestival={setFestivalId}
        onLocation={setLocation}
      />
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Show start date</span>
        <input
          type="date"
          className={inputClass}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Show end date</span>
        <input
          type="date"
          className={inputClass}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Load-in days</span>
        <input
          type="number"
          min={0}
          className={inputClass}
          value={loadInDays}
          onChange={(e) => setLoadInDays(Math.max(0, Number(e.target.value)))}
        />
        <span className="mt-1 block text-xs text-ink-muted">
          Days before the show — adds them to the schedule.
        </span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Load-out days</span>
        <input
          type="number"
          min={0}
          className={inputClass}
          value={loadOutDays}
          onChange={(e) => setLoadOutDays(Math.max(0, Number(e.target.value)))}
        />
        <span className="mt-1 block text-xs text-ink-muted">
          Days after the show — adds them to the schedule.
        </span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Timezone</span>
        <select
          className={inputClass}
          value={timeZone}
          onChange={(e) => setTimeZone(e.target.value)}
        >
          {COMMON_TIME_ZONES.map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Venue</span>
        <input
          className={inputClass}
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          placeholder="Riverside Park"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Short code</span>
        <input
          className={inputClass}
          value={shortCode}
          onChange={(e) => setShortCode(e.target.value)}
          maxLength={16}
          placeholder="BOTB"
        />
        <span className="mt-1 block text-xs text-ink-muted">
          Optional. Names the event&rsquo;s calendar and prefixes advance-call titles, e.g. BOTB.
        </span>
      </label>
      <DriveFolderField folder={driveFolder} onChange={setDriveFolder} onError={setLocalError} />
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Booking label</span>
        <input
          className={inputClass}
          value={bookingLabel}
          onChange={(e) => setBookingLabel(e.target.value)}
          placeholder="RTC Ashland"
        />
        <span className="mt-1 block text-xs text-ink-muted">
          Optional. The festival name as it appears in your Appointment Schedule booking titles, so
          booked advance calls map to this event during sync.
        </span>
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">URL slug</span>
        <input
          className={inputClass}
          value={slugField.value}
          onChange={(e) => slugField.onChange(e.target.value)}
          placeholder="rtc-ashland-26"
        />
        <span className="mt-1 block text-xs text-ink-muted">
          Web address: <span className="font-mono">/events/{slugify(slugField.value) || '…'}</span>.
          Defaults from the booking label (or name) + year — edit to customize.
        </span>
      </label>
      {showStatus && (
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Status</span>
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as EventStatus)}
          >
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
      <DepartmentCheckboxes departments={departments} deptIds={deptIds} onToggle={toggleDept} />

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        )}
        {(localError || error) && (
          <span className="text-sm text-accent">{localError ?? error}</span>
        )}
      </div>
    </form>
  );
}
