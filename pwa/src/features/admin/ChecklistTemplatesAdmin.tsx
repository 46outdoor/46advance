import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import {
  CHECKLIST_SECTIONS,
  CHECKLIST_SECTION_LABELS,
  checklistTemplateInputSchema,
  type ChecklistSection,
  type ChecklistTemplate,
  type ChecklistTemplateInput,
} from '@/lib/checklists/checklist';
import {
  checklistTemplatesKey,
  createChecklistTemplate,
  deleteChecklistTemplate,
  listChecklistTemplates,
  saveChecklistTemplate,
} from '@/lib/checklists/checklist-templates-service';

const logger = createLogger('Admin');

/** One line per item; line order is the item order PMs get on import. */
function itemsToLines(template: ChecklistTemplate, section: ChecklistSection): string {
  return template.items
    .filter((i) => i.section === section)
    .map((i) => i.text)
    .join('\n');
}

function linesToItems(lines: Record<ChecklistSection, string>): ChecklistTemplateInput['items'] {
  return CHECKLIST_SECTIONS.flatMap((section) =>
    lines[section]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((text) => ({ text, section })),
  );
}

/** Editor for one template: name + one textarea per section (a line per item). */
function TemplateEditor({
  template,
  pending,
  onSave,
  onDelete,
}: {
  template: ChecklistTemplate;
  pending: boolean;
  onSave: (input: ChecklistTemplateInput) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [lines, setLines] = useState<Record<ChecklistSection, string>>({
    main: itemsToLines(template, 'main'),
    'post-show': itemsToLines(template, 'post-show'),
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const parsed = checklistTemplateInputSchema.safeParse({
      name,
      items: linesToItems(lines),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid template.');
      return;
    }
    setError(null);
    onSave(parsed.data);
  };

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface-muted/40 p-4">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Template name</span>
        <input
          className="w-full max-w-sm rounded border border-line px-3 py-2 outline-none focus:border-brand"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        {CHECKLIST_SECTIONS.map((section) => (
          <label key={section} className="block text-sm">
            <span className="mb-1 block font-semibold text-ink">
              {section === 'main' ? 'Main items' : CHECKLIST_SECTION_LABELS[section]}{' '}
              <span className="font-normal text-ink-muted">(one per line, in order)</span>
            </span>
            <textarea
              className="h-48 w-full rounded border border-line px-3 py-2 font-mono text-sm outline-none focus:border-brand"
              value={lines[section]}
              onChange={(e) => setLines((prev) => ({ ...prev, [section]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-accent">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save template'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          className="rounded border border-line px-3 py-2 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {confirmDelete ? 'Confirm delete' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

/** Admin: event-checklist templates — PMs import these onto their events. */
export function ChecklistTemplatesAdmin() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [newName, setNewName] = useState('');

  const templatesQuery = useQuery({
    queryKey: checklistTemplatesKey(),
    queryFn: listChecklistTemplates,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: checklistTemplatesKey() });

  const create = useMutation({
    mutationFn: () => createChecklistTemplate({ name: newName.trim(), items: [] }),
    onSuccess: (id) => {
      void invalidate();
      setNewName('');
      setSelectedId(id);
    },
    onError: (err) => logger.error('Failed to create checklist template', err),
  });
  const save = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ChecklistTemplateInput }) =>
      saveChecklistTemplate(id, input),
    onSuccess: () => void invalidate(),
    onError: (err) => logger.error('Failed to save checklist template', err),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteChecklistTemplate(id),
    onSuccess: () => {
      void invalidate();
      setSelectedId('');
    },
    onError: (err) => logger.error('Failed to delete checklist template', err),
  });

  const selected = templatesQuery.data?.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-brand">Checklist templates</h2>
      <p className="text-sm text-ink-muted">
        Production managers can import these onto an event&apos;s checklist (main + Post-Show
        sections). Events start with a blank checklist; importing appends the template&apos;s items.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Edit template</span>
          <select
            className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">Select…</option>
            {templatesQuery.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-2 text-sm text-ink-muted">or</span>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) create.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-ink">New template</span>
            <input
              className="rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Standard show"
            />
          </label>
          <button
            type="submit"
            disabled={!newName.trim() || create.isPending}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </form>
      </div>

      {selected && (
        <TemplateEditor
          key={selected.id}
          template={selected}
          pending={save.isPending || remove.isPending}
          onSave={(input) => save.mutate({ id: selected.id, input })}
          onDelete={() => remove.mutate(selected.id)}
        />
      )}
    </div>
  );
}
