/**
 * Schedule-template editor: name + category + an ordered list of blueprint items. Items live in
 * local state; "Save template" persists the whole template at once. Importing a template into an
 * event happens from the event's schedule screen.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { slotLabel } from '@/lib/advances/advance';
import { scheduleSectionLabel } from '@/lib/schedules/sections';
import {
  SCHEDULE_TEMPLATE_CATEGORIES,
  scheduleTemplateCategoryLabel,
  templateDayLabel,
  type ScheduleTemplate,
  type ScheduleTemplateCategory,
  type ScheduleTemplateItem,
} from '@/lib/schedules/scheduleTemplate';
import { getScheduleTemplate, updateScheduleTemplate } from '@/lib/schedules/schedule-templates-service';
import { ScheduleTemplateItemForm, type ScheduleTemplateItemDraft } from './ScheduleTemplateItemForm';

const logger = createLogger('ScheduleTemplates');
const inputClass = 'rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand';
const arrowClass = 'rounded border border-line px-1.5 text-ink-muted hover:border-accent hover:text-accent disabled:opacity-30';
const chipButton = 'rounded border border-line px-2 py-1 text-xs text-ink-muted hover:border-accent hover:text-accent';

function itemSummary(item: ScheduleTemplateItem): string {
  const parts: string[] = [templateDayLabel(item.dayOffset)];
  if (item.timeOfDay) parts.push(item.endTimeOfDay ? `${item.timeOfDay}–${item.endTimeOfDay}` : item.timeOfDay);
  parts.push(scheduleSectionLabel(item.section, item.customLabel));
  if (item.stageName) parts.push(item.stageName);
  if (item.slot != null) parts.push(slotLabel(item.slot));
  if (item.location) parts.push(item.location);
  return parts.join(' · ');
}

function ItemRow({
  item,
  canUp,
  canDown,
  onUp,
  onDown,
  onEdit,
  onRemove,
}: {
  item: ScheduleTemplateItem;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
      <div className="min-w-0">
        <p className="font-semibold text-ink">{item.title}</p>
        <p className="text-xs text-ink-muted">{itemSummary(item)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs">
        <div className="flex flex-col gap-0.5">
          <button type="button" aria-label="Move up" disabled={!canUp} onClick={onUp} className={arrowClass}>↑</button>
          <button type="button" aria-label="Move down" disabled={!canDown} onClick={onDown} className={arrowClass}>↓</button>
        </div>
        <button type="button" onClick={onEdit} className={chipButton}>Edit</button>
        <button type="button" onClick={onRemove} className={chipButton}>Remove</button>
      </div>
    </li>
  );
}

function reindex(items: ScheduleTemplateItem[]): ScheduleTemplateItem[] {
  return items.map((it, i) => ({ ...it, order: i }));
}

function Editor({ template }: { template: ScheduleTemplate }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState<ScheduleTemplateCategory>(template.category);
  const [items, setItems] = useState<ScheduleTemplateItem[]>(template.items);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => updateScheduleTemplate(template.id, { name: name.trim(), category, items }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scheduleTemplate', template.id] });
      void queryClient.invalidateQueries({ queryKey: ['scheduleTemplates'] });
    },
    onError: (err) => logger.error('Failed to save schedule template', err),
  });

  const addItem = (draft: ScheduleTemplateItemDraft) => {
    setItems((p) => [...p, { ...draft, id: crypto.randomUUID(), order: p.length }]);
    setAdding(false);
  };
  const editItem = (id: string, draft: ScheduleTemplateItemDraft) => {
    setItems((p) => p.map((it) => (it.id === id ? { ...draft, id, order: it.order } : it)));
    setEditingId(null);
  };
  const removeItem = (id: string) => setItems((p) => reindex(p.filter((it) => it.id !== id)));
  const move = (index: number, dir: -1 | 1) => {
    setItems((p) => {
      const j = index + dir;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[index], next[j]] = [next[j], next[index]];
      return reindex(next);
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <Link to="/schedule-templates" className="text-sm text-ink-muted hover:text-accent">
          ← Schedule templates
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Name</span>
          <input className={`${inputClass} w-64`} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Category</span>
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as ScheduleTemplateCategory)}>
            {SCHEDULE_TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {scheduleTemplateCategoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save template'}
        </button>
        {save.isSuccess && <span className="text-sm text-status-complete">Saved.</span>}
        {save.isError && <span className="text-sm text-accent">Could not save.</span>}
      </div>

      <ul className="space-y-2">
        {items.map((it, i) =>
          editingId === it.id ? (
            <li key={it.id}>
              <ScheduleTemplateItemForm
                initial={it}
                submitLabel="Save item"
                onSubmit={(d) => editItem(it.id, d)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <ItemRow
              key={it.id}
              item={it}
              canUp={i > 0}
              canDown={i < items.length - 1}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
              onEdit={() => setEditingId(it.id)}
              onRemove={() => removeItem(it.id)}
            />
          ),
        )}
      </ul>

      {adding ? (
        <ScheduleTemplateItemForm submitLabel="Add item" onSubmit={addItem} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-sm text-ink-muted hover:text-ink">
          + Add item
        </button>
      )}

      <p className="text-xs text-ink-muted">
        Items are saved with <strong>Save template</strong> — add or edit them, then save.
      </p>
    </section>
  );
}

export function ScheduleTemplateEditorScreen() {
  const { id } = useParams();
  const templateQuery = useQuery({
    queryKey: ['scheduleTemplate', id],
    queryFn: () => getScheduleTemplate(id!),
    enabled: !!id,
  });

  if (templateQuery.isLoading) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!templateQuery.data) return <p className="text-sm text-accent">Schedule template not found.</p>;
  return <Editor key={templateQuery.data.id} template={templateQuery.data} />;
}
