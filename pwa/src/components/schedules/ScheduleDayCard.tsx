/**
 * One schedule day container (planning/archive/feature/SCHEDULE_REDESIGN.md § UI): a color-coded header
 * (day type drives the color; type label + title + description inline, date right), the
 * day-notes line, and the items grid — Start | End | Duration | Type | Item |
 * Description — on shared column widths so every card's columns align down the page.
 * View rows resolve `{artist N}` placeholders and show per-type fields / crew lines as
 * muted sub-rows; edit mode swaps rows for inline editors and adds day-level controls.
 * Shared by the event schedule (and the template editor, redesign PR 3).
 */
import { formatWallClockTime } from '@/lib/dates/formatting';
import { scheduleDayTypeDef } from '@/lib/schedules/dayTypes';
import { scheduleItemTypeDef } from '@/lib/schedules/itemTypes';
import { itemDurationLabel, sortDayItems, type ScheduleDay, type ScheduleDayItem } from '@/lib/schedules/scheduleDay';
import { ScheduleTypeDot } from './ScheduleTypeDot';
import { CrewLinesGrid } from './CrewLines';
import { ScheduleItemRowEditor, type StageOption } from './ScheduleItemRowEditor';

const COLS =
  'sm:grid sm:grid-cols-[4.5rem_4.5rem_4.5rem_2rem_minmax(8rem,1fr)_minmax(10rem,1.4fr)] sm:gap-x-3';
/** Edit-mode template — the Type cell widens from a dot to a select. Keep in sync with
 * ScheduleItemRowEditor's row grid. */
const EDIT_COLS =
  'sm:grid sm:grid-cols-[4.5rem_4.5rem_4.5rem_5.5rem_minmax(8rem,1fr)_minmax(10rem,1.4fr)] sm:gap-x-3';

export type ResolveItemText = (item: ScheduleDayItem, text: string) => string;

/** The slice of a day the card renders — the event screen passes a full ScheduleDay;
 * the template editor passes a view built from a template day (offset as id). */
export type ScheduleDayView = Pick<ScheduleDay, 'id' | 'dayType' | 'title' | 'description' | 'notes'>;

/** "Location: FOH · Carrier: Delta · Conf #: ABC123" — the populated per-type fields. */
function typeFieldsSummary(item: ScheduleDayItem): string {
  return scheduleItemTypeDef(item.type)
    .fields.filter((f) => item.fields[f.key])
    .map((f) => `${f.label}: ${item.fields[f.key]}`)
    .join(' · ');
}

function ViewRow({ item, resolveText }: { item: ScheduleDayItem; resolveText: ResolveItemText }) {
  const detail = typeFieldsSummary(item);
  return (
    <li className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5 text-sm ${COLS}`}>
      <span className="text-ink-muted tabular-nums">{item.startTime ? formatWallClockTime(item.startTime) : '—'}</span>
      <span className="text-ink-muted tabular-nums">
        {item.endTime ? `${formatWallClockTime(item.endTime)}${item.endEstimated ? ' (est)' : ''}` : ''}
      </span>
      <span className="text-ink-muted tabular-nums">{itemDurationLabel(item) ?? ''}</span>
      <span>
        <ScheduleTypeDot type={item.type} customLabel={item.customLabel} />
      </span>
      <span className="font-semibold text-ink">{resolveText(item, item.item)}</span>
      <span className="text-ink-muted">{item.description ? resolveText(item, item.description) : ''}</span>
      {(detail || item.crew.length > 0) && (
        <div className="w-full space-y-1 sm:col-span-2 sm:col-start-5 sm:w-auto">
          {detail && <p className="text-xs text-ink-muted">{detail}</p>}
          <CrewLinesGrid crew={item.crew} />
        </div>
      )}
    </li>
  );
}

export function ScheduleDayCard({
  day,
  dateLabel,
  items,
  editing,
  stages,
  crewTypes,
  resolveText,
  onEditDay,
  onDeleteDay,
  onAddItem,
  onCommitItem,
  onDeleteItem,
}: {
  day: ScheduleDayView;
  /** Formatted header date (event: "Tue, Jul 14, 2026"; templates: "Load-in 2"). */
  dateLabel: string;
  /** The rows to render (already filtered by the screen; sorted here). */
  items: readonly ScheduleDayItem[];
  editing: boolean;
  stages: readonly StageOption[];
  crewTypes: readonly string[];
  resolveText: ResolveItemText;
  onEditDay: () => void;
  onDeleteDay: () => void;
  onAddItem: () => void;
  onCommitItem: (item: ScheduleDayItem) => void;
  onDeleteItem: (itemId: string) => void;
}) {
  const dayType = scheduleDayTypeDef(day.dayType);
  const sorted = sortDayItems(items);
  return (
    <section className="overflow-hidden rounded-lg border border-line">
      <header
        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-white"
        style={{ backgroundColor: dayType.color }}
      >
        <span>
          <span className="font-bold">
            {dayType.label}
            {day.title ? ` — ${day.title}` : ''}
          </span>
          {day.description && <span className="text-sm opacity-90"> · {day.description}</span>}
        </span>
        <span className="flex items-baseline gap-3 text-sm">
          <span className="opacity-90">{dateLabel}</span>
          {editing && (
            <>
              <button
                type="button"
                className="inline-flex min-h-11 items-center text-xs font-semibold underline-offset-2 hover:underline sm:min-h-0"
                onClick={onEditDay}
              >
                Edit day
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center text-xs font-semibold underline-offset-2 hover:underline sm:min-h-0"
                onClick={onDeleteDay}
              >
                Delete day
              </button>
            </>
          )}
        </span>
      </header>

      {day.notes && (
        <p className="border-b border-line bg-surface-muted/40 px-3 py-1.5 text-xs text-ink-muted">
          <span className="font-semibold text-ink">Day notes:</span> {day.notes}
        </p>
      )}

      <div
        className={`hidden border-b border-line px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-muted ${editing ? EDIT_COLS : COLS}`}
      >
        <span>Start</span>
        <span>End</span>
        <span>Duration</span>
        <span>Type</span>
        <span>Item</span>
        <span>Description</span>
      </div>

      {sorted.length === 0 ? (
        <p className="px-3 py-3 text-sm text-ink-muted">No items on this day.</p>
      ) : editing ? (
        <div className="divide-y divide-line/60">
          {sorted.map((item) => (
            <ScheduleItemRowEditor
              key={item.id}
              item={item}
              stages={stages}
              crewTypes={crewTypes}
              onCommit={onCommitItem}
              onDelete={() => onDeleteItem(item.id)}
            />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line/60">
          {sorted.map((item) => (
            <ViewRow key={item.id} item={item} resolveText={resolveText} />
          ))}
        </ul>
      )}

      {editing && (
        <div className="border-t border-line px-3 py-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded border border-line px-3 py-1 text-xs font-semibold text-ink transition-colors hover:border-accent hover:text-accent sm:min-h-0"
            onClick={onAddItem}
          >
            + Add item
          </button>
        </div>
      )}
    </section>
  );
}
