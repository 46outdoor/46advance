import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { emptyTemplateInput } from '@/lib/templates/template';
import { createTemplate, deleteTemplate, listTemplates } from '@/lib/templates/templates-service';

const logger = createLogger('Templates');

/** Admin: list templates + create/delete. Editing happens on the editor screen. */
export function TemplatesListScreen() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['templates'] });

  const create = useMutation({
    mutationFn: () => createTemplate({ ...emptyTemplateInput(), name: name.trim() }),
    onSuccess: (id) => {
      void invalidate();
      setName('');
      navigate(`/templates/${id}`);
    },
    onError: (err) => logger.error('Failed to create template', err),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to delete template', err),
  });

  const templates = templatesQuery.data ?? [];

  return (
    <section className="space-y-6">
      <h1 className="font-display text-3xl font-black tracking-tight text-brand">Templates</h1>
      <p className="text-sm text-ink-muted">
        Blueprints for new events — seed departments, stages, production defaults, and roles.
      </p>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">New template</span>
          <input
            className="w-72 rounded border border-line px-3 py-2 outline-none focus:border-brand"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. RTC Standard"
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Create
        </button>
      </form>

      {templatesQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {templates.length === 0 && templatesQuery.data && (
        <p className="text-sm text-ink-muted">No templates yet.</p>
      )}
      <ul className="divide-y divide-line/60">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-3">
            <Link to={`/templates/${t.id}`} className="font-semibold text-brand hover:text-accent">
              {t.name}
            </Link>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate(t.id)}
              className="rounded border border-line px-2 py-1 text-xs text-ink-muted hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
