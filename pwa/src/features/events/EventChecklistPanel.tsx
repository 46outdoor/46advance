import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createLogger } from '@/lib/logger';
import { dateToZonedInput, zonedInputToDate } from '@/lib/dates/timezone';
import {
  CHECKLIST_SECTIONS,
  CHECKLIST_SECTION_LABELS,
  formatChecklistTimestamp,
  type ChecklistItem,
  type ChecklistSection,
} from '@/lib/checklists/checklist';
import {
  checklistTemplatesKey,
  listChecklistTemplates,
} from '@/lib/checklists/checklist-templates-service';
import {
  addChecklistItem,
  applyChecklistArrangement,
  deleteChecklistItem,
  eventChecklistKey,
  importChecklistTemplate,
  listChecklistItems,
  setChecklistItemCompletedAt,
  setChecklistItemText,
} from './event-checklist-service';

const logger = createLogger('EventChecklist');

/** Droppable id for a section container (so items can be dragged into an empty section). */
const sectionDropId = (section: ChecklistSection) => `section:${section}`;

/** Editable completion stamp: text button → datetime-local input (event timezone). */
function CompletedStamp({
  completedAt,
  timeZone,
  pending,
  onChange,
}: {
  completedAt: Date;
  timeZone: string;
  pending: boolean;
  onChange: (at: Date) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  if (!editing) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setValue(dateToZonedInput(completedAt, timeZone));
          setEditing(true);
        }}
        title="Edit completion time"
        className="whitespace-nowrap text-xs text-ink-muted hover:text-accent disabled:opacity-50"
      >
        {formatChecklistTimestamp(completedAt, timeZone)}
      </button>
    );
  }
  const commit = () => {
    const next = zonedInputToDate(value, timeZone);
    if (next) onChange(next);
    setEditing(false);
  };
  return (
    <input
      type="datetime-local"
      className="rounded border border-line px-1 py-0.5 text-xs outline-none focus:border-brand"
      value={value}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

function ChecklistRow({
  item,
  timeZone,
  canEdit,
  pending,
  onToggle,
  onSetCompletedAt,
  onSetText,
  onDelete,
}: {
  item: ChecklistItem;
  timeZone: string;
  /** False for read-only oversight: no handle, rename, completion, stamp edit, or delete. */
  canEdit: boolean;
  pending: boolean;
  onToggle: (done: boolean) => void;
  onSetCompletedAt: (at: Date) => void;
  onSetText: (text: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);

  const commitText = () => {
    setEditing(false);
    const next = text.trim();
    if (next && next !== item.text) onSetText(next);
    else setText(item.text);
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex min-h-11 items-center gap-2 rounded px-1 py-1 ${
        isDragging ? 'z-10 bg-surface-muted shadow' : ''
      }`}
    >
      {canEdit && (
        <button
          type="button"
          aria-label={`Drag to reorder: ${item.text}`}
          className="cursor-grab touch-none px-1 text-ink-muted hover:text-ink active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          ≡
        </button>
      )}
      <input
        type="checkbox"
        aria-label={
          canEdit
            ? `Mark complete: ${item.text}`
            : `${item.text}: ${item.completedAt ? 'complete' : 'not complete'}`
        }
        checked={item.completedAt !== null}
        disabled={!canEdit || pending}
        onChange={(e) => onToggle(e.target.checked)}
      />
      {!canEdit ? (
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            item.completedAt ? 'text-ink-muted line-through' : 'text-ink'
          }`}
        >
          {item.text}
        </span>
      ) : editing ? (
        <input
          className="min-w-0 flex-1 rounded border border-line px-2 py-1 text-sm outline-none focus:border-brand"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitText();
            if (e.key === 'Escape') {
              setText(item.text);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`min-w-0 flex-1 truncate text-left text-sm ${
            item.completedAt ? 'text-ink-muted line-through' : 'text-ink'
          }`}
          title="Edit item"
        >
          {item.text}
        </button>
      )}
      {item.completedAt &&
        (canEdit ? (
          <CompletedStamp
            completedAt={item.completedAt}
            timeZone={timeZone}
            pending={pending}
            onChange={onSetCompletedAt}
          />
        ) : (
          <span className="whitespace-nowrap text-xs text-ink-muted">
            {formatChecklistTimestamp(item.completedAt, timeZone)}
          </span>
        ))}
      {canEdit && (
        <button
          type="button"
          aria-label={`Delete: ${item.text}`}
          disabled={pending}
          onClick={onDelete}
          className="px-1 text-ink-muted hover:text-accent disabled:opacity-50"
        >
          ×
        </button>
      )}
    </li>
  );
}

/** One add-item input, appended under each section's list. */
function AddItemInput({
  section,
  pending,
  onAdd,
}: {
  section: ChecklistSection;
  pending: boolean;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const commit = () => {
    const next = text.trim();
    if (!next) return;
    onAdd(next);
    setText('');
  };
  return (
    <form
      className="mt-1 flex items-center gap-2 pl-7"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input
        className="min-w-0 flex-1 rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-brand"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={section === 'post-show' ? 'Add a post-show item…' : 'Add an item…'}
      />
      <button
        type="submit"
        disabled={!text.trim() || pending}
        className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}

interface EventChecklistPanelProps {
  eventId: string;
  /** Event timezone — completion stamps display and edit in it. */
  timeZone: string;
  /**
   * May READ the checklist: PM/admin, or a production director overseeing the event.
   * The panel renders nothing otherwise (`canReadChecklist` in the rules mirrors this —
   * leads and techs are denied). Optional; defaults to `canEdit`, the pre-oversight
   * behaviour, so callers that don't know about oversight yet are unchanged.
   */
  canView?: boolean;
  /** May MUTATE the checklist: PM/admin only (`canEditEvent`). */
  canEdit: boolean;
}

/**
 * Event checklist (PM/admin editable, read-only for production directors; hidden from
 * leads/techs — the rules deny them reads). Two fixed sections (main + Post-Show), drag to
 * reorder within or across them, checkbox completion stamps an editable time. Not part of
 * the advance tracker.
 *
 * `canView` gates rendering + the reads; `canEdit` gates every control (import, add, rename,
 * reorder, complete/uncomplete, stamp edit, delete). A viewer without `canEdit` sees the
 * items and their completion stamps and nothing else.
 */
export function EventChecklistPanel({
  eventId,
  timeZone,
  canEdit,
  canView = canEdit,
}: EventChecklistPanelProps) {
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState('');
  // Optimistic arrangement while a drag's batch write is in flight (null = trust the query).
  const [arranged, setArranged] = useState<ChecklistItem[] | null>(null);

  // enabled: canView — leads/techs must not fire reads the rules will deny.
  const itemsQuery = useQuery({
    queryKey: eventChecklistKey(eventId),
    queryFn: () => listChecklistItems(eventId),
    enabled: canView,
  });
  // Templates feed the Import control only, so read-only viewers never fetch them.
  const templatesQuery = useQuery({
    queryKey: checklistTemplatesKey(),
    queryFn: listChecklistTemplates,
    enabled: canEdit,
  });

  const items = arranged ?? itemsQuery.data ?? [];
  const bySection = (section: ChecklistSection) => items.filter((i) => i.section === section);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: eventChecklistKey(eventId) });

  const mutationOpts = (what: string) => ({
    onSuccess: () => void invalidate(),
    onError: (err: unknown) => {
      logger.error(`Failed to ${what}`, err);
      void invalidate();
    },
  });

  const add = useMutation({
    mutationFn: ({ text, section }: { text: string; section: ChecklistSection }) => {
      const inSection = bySection(section);
      const nextOrder = inSection.length ? Math.max(...inSection.map((i) => i.order)) + 1 : 0;
      return addChecklistItem(eventId, text, section, nextOrder);
    },
    ...mutationOpts('add checklist item'),
  });
  const setText = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      setChecklistItemText(eventId, id, text),
    ...mutationOpts('rename checklist item'),
  });
  const setCompleted = useMutation({
    mutationFn: ({ id, at }: { id: string; at: Date | null }) =>
      setChecklistItemCompletedAt(eventId, id, at),
    ...mutationOpts('update checklist completion'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteChecklistItem(eventId, id),
    ...mutationOpts('delete checklist item'),
  });
  const reorder = useMutation({
    mutationFn: (next: ChecklistItem[]) => applyChecklistArrangement(eventId, next),
    onSettled: () => {
      void invalidate();
      setArranged(null);
    },
    onError: (err: unknown) => logger.error('Failed to reorder checklist', err),
  });
  const importTemplate = useMutation({
    mutationFn: () => {
      const template = templatesQuery.data?.find((t) => t.id === templateId);
      if (!template) throw new Error('Select a template.');
      return importChecklistTemplate(eventId, template, itemsQuery.data ?? []);
    },
    ...mutationOpts('import checklist template'),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!canEdit || !over || active.id === over.id) return;
    const moving = items.find((i) => i.id === active.id);
    if (!moving) return;

    const overSection = String(over.id).startsWith('section:')
      ? (String(over.id).slice('section:'.length) as ChecklistSection)
      : (items.find((i) => i.id === over.id)?.section ?? moving.section);

    const without = items.filter((i) => i.id !== moving.id);
    const target = without.filter((i) => i.section === overSection);
    const overIndex = target.findIndex((i) => i.id === over.id);
    const insertAt = overIndex === -1 ? target.length : overIndex;
    target.splice(insertAt, 0, { ...moving, section: overSection });

    const next = [
      ...CHECKLIST_SECTIONS.flatMap((s) =>
        s === overSection ? target : without.filter((i) => i.section === s),
      ),
    ].map((i, index) => ({ ...i, order: index }));
    setArranged(next);
    reorder.mutate(next);
  };

  if (!canView) return null;

  const pending = add.isPending || setText.isPending || setCompleted.isPending || remove.isPending;
  const done = items.filter((i) => i.completedAt !== null).length;

  return (
    <div className="space-y-3 border-t border-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold text-brand">
          Event Checklist
          {items.length > 0 && (
            <span className="ml-3 align-middle text-sm font-normal text-ink-muted">
              {done}/{items.length} done
            </span>
          )}
        </h2>
        {canEdit && (
          <div className="flex items-center gap-2">
            <select
              className="rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-brand"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              aria-label="Checklist template to import"
            >
              <option value="">Import from template…</option>
              {templatesQuery.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!templateId || importTemplate.isPending}
              onClick={() => importTemplate.mutate()}
              className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {importTemplate.isPending ? 'Importing…' : 'Import'}
            </button>
          </div>
        )}
      </div>

      {itemsQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        {CHECKLIST_SECTIONS.map((section) => (
          <ChecklistSectionList
            key={section}
            section={section}
            items={bySection(section)}
            timeZone={timeZone}
            canEdit={canEdit}
            pending={pending}
            onToggle={(id, doneNow) => setCompleted.mutate({ id, at: doneNow ? new Date() : null })}
            onSetCompletedAt={(id, at) => setCompleted.mutate({ id, at })}
            onSetText={(id, text) => setText.mutate({ id, text })}
            onDelete={(id) => remove.mutate(id)}
            onAdd={(text) => add.mutate({ text, section })}
          />
        ))}
      </DndContext>
    </div>
  );
}

function ChecklistSectionList({
  section,
  items,
  timeZone,
  canEdit,
  pending,
  onToggle,
  onSetCompletedAt,
  onSetText,
  onDelete,
  onAdd,
}: {
  section: ChecklistSection;
  items: ChecklistItem[];
  timeZone: string;
  /** False for read-only oversight: rows lose their controls and no add input renders. */
  canEdit: boolean;
  pending: boolean;
  onToggle: (id: string, done: boolean) => void;
  onSetCompletedAt: (id: string, at: Date) => void;
  onSetText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onAdd: (text: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: sectionDropId(section) });
  return (
    <div ref={setNodeRef}>
      {section !== 'main' && (
        <h3 className="mt-4 border-t border-line/60 pt-3 text-sm font-semibold text-ink">
          {CHECKLIST_SECTION_LABELS[section]}
        </h3>
      )}
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul>
          {items.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              timeZone={timeZone}
              canEdit={canEdit}
              pending={pending}
              onToggle={(done) => onToggle(item.id, done)}
              onSetCompletedAt={(at) => onSetCompletedAt(item.id, at)}
              onSetText={(text) => onSetText(item.id, text)}
              onDelete={() => onDelete(item.id)}
            />
          ))}
        </ul>
      </SortableContext>
      {items.length === 0 && section === 'main' && (
        <p className={`text-sm text-ink-muted ${canEdit ? 'pl-7' : ''}`}>
          {canEdit ? 'No items yet — add one below or import a template.' : 'No items yet.'}
        </p>
      )}
      {canEdit && <AddItemInput section={section} pending={pending} onAdd={onAdd} />}
    </div>
  );
}
