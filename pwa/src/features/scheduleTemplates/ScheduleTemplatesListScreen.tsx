/**
 * Admin: list schedule templates (grouped feel via a category tag) + create/delete. Editing the
 * items happens on the editor screen; importing into an event happens from its schedule screen.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import {
  SCHEDULE_TEMPLATE_CATEGORIES,
  scheduleTemplateCategoryLabel,
  type ScheduleTemplateCategory,
} from '@/lib/schedules/scheduleTemplate';
import {
  createScheduleTemplate,
  deleteScheduleTemplate,
  listScheduleTemplates,
} from '@/lib/schedules/schedule-templates-service';

const logger = createLogger('ScheduleTemplates');

export function ScheduleTemplatesListScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ScheduleTemplateCategory>('production');

  const templatesQuery = useQuery({ queryKey: ['scheduleTemplates'], queryFn: listScheduleTemplates });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['scheduleTemplates'] });

  const create = useMutation({
    mutationFn: () => createScheduleTemplate({ name: name.trim(), category, items: [] }, user!.uid),
    onSuccess: (id) => {
      void invalidate();
      setName('');
      navigate(`/schedule-templates/${id}`);
    },
    onError: (err) => logger.error('Failed to create schedule template', err),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteScheduleTemplate(id),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to delete schedule template', err),
  });

  const templates = templatesQuery.data ?? [];

  return (
    <section className="space-y-6">
      <div>
        <Link to="/admin" className="text-sm text-ink-muted hover:text-accent">
          ← Admin
        </Link>
      </div>
      <h1 className="font-display text-3xl font-black tracking-tight text-brand">Schedule templates</h1>
      <p className="text-sm text-ink-muted">
        Reusable schedule blueprints (Production, Show, Stagehand…) you can import into any event's schedule.
      </p>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">New template</span>
          <input
            className="w-64 rounded border border-line px-3 py-2 outline-none focus:border-brand"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Festival load-in"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Category</span>
          <select
            className="rounded border border-line px-3 py-2 outline-none focus:border-brand"
            value={category}
            onChange={(e) => setCategory(e.target.value as ScheduleTemplateCategory)}
          >
            {SCHEDULE_TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {scheduleTemplateCategoryLabel(c)}
              </option>
            ))}
          </select>
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
        <p className="text-sm text-ink-muted">No schedule templates yet.</p>
      )}
      <ul className="divide-y divide-line/60">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-3">
            <Link to={`/schedule-templates/${t.id}`} className="font-semibold text-brand hover:text-accent">
              {t.name}
              <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-muted">
                {scheduleTemplateCategoryLabel(t.category)}
              </span>
              <span className="ml-2 text-xs font-normal text-ink-muted">
                {t.items.length} item{t.items.length === 1 ? '' : 's'}
              </span>
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
