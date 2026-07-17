import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { EVENT_PRODUCTION_FIELDS, getDepartmentFields } from '@/lib/advances/fields';
import { listDepartments } from '@/lib/departments/departments-service';
import { listUsers } from '@/lib/users/users-service';
import { getTemplate, patchTemplate } from '@/lib/templates/templates-service';
import { listScheduleTemplates } from '@/lib/schedules/schedule-templates-service';
import {
  scheduleTemplateCategoryLabel,
  templateItemCount,
  type ScheduleTemplate,
} from '@/lib/schedules/scheduleTemplate';
import type { DepartmentRecord } from '@/lib/departments/department';
import { emptyLogo, type Logo } from '@/lib/branding/logo';
import { LogoUploader } from '@/components/branding/LogoUploader';
import { SectionContentForm } from '@/components/production/SectionContentForm';
import { ProductionContactsEditor } from '@/components/production/ProductionContactsEditor';
import { ProductionLinksEditor } from '@/components/production/ProductionLinksEditor';
import { StagesEditor } from './StagesEditor';
import { TemplateRolesEditor } from './TemplateRolesEditor';

const logger = createLogger('Templates');

export function TemplateEditorScreen() {
  const { templateId } = useParams();
  const queryClient = useQueryClient();

  const templateQuery = useQuery({
    queryKey: ['template', templateId],
    queryFn: () => getTemplate(templateId!),
    enabled: !!templateId,
  });
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: listDepartments });
  const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: listUsers });
  const scheduleTemplatesQuery = useQuery({ queryKey: ['scheduleTemplates'], queryFn: listScheduleTemplates });

  const patch = useMutation({
    mutationFn: (data: Record<string, unknown>) => patchTemplate(templateId!, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['template', templateId] }),
    onError: (err) => logger.error('Failed to save template', err),
  });

  if (!templateId) return null;
  const t = templateQuery.data;
  const departments = departmentsQuery.data ?? [];
  const enabled = new Set(t?.departmentIds ?? []);
  const enabledDepts = departments.filter((d) => enabled.has(d.id));

  return (
    <section className="space-y-6">
      <Link to="/templates" className="text-sm text-ink-muted hover:text-accent">
        ← Templates
      </Link>

      {templateQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {templateQuery.data === null && <p className="text-sm text-ink-muted">Template not found.</p>}

      {t && (
        <>
          <NameField key={t.id} initial={t.name} pending={patch.isPending} onSave={(name) => patch.mutate({ name })} />

          <Block title="Event logo">
            <EventLogoField
              key={`logo-${t.id}`}
              templateId={t.id}
              initial={t.eventLogo}
              pending={patch.isPending}
              onSave={(eventLogo) => patch.mutate({ eventLogo })}
            />
          </Block>

          <Block title="Departments">
            <DepartmentsField
              key={`d-${t.id}`}
              all={departments}
              selected={t.departmentIds}
              pending={patch.isPending}
              onSave={(departmentIds) => patch.mutate({ departmentIds })}
            />
          </Block>

          <Block title="Stages">
            <StagesEditor key={`s-${t.id}`} initial={t.stages} pending={patch.isPending} onSave={(stages) => patch.mutate({ stages })} />
          </Block>

          <Block title="Default roles">
            <TemplateRolesEditor
              key={`r-${t.id}`}
              users={usersQuery.data ?? []}
              initial={t.members}
              pending={patch.isPending}
              onSave={(members) => patch.mutate({ members })}
            />
          </Block>

          <Block title="Schedule templates">
            <ScheduleTemplatesField
              key={`st-${t.id}`}
              all={scheduleTemplatesQuery.data ?? []}
              selected={t.scheduleTemplateIds}
              pending={patch.isPending}
              onSave={(scheduleTemplateIds) => patch.mutate({ scheduleTemplateIds })}
            />
          </Block>

          <Block title="Event production defaults">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Site / production info</h3>
            <SectionContentForm
              key={`ep-${t.id}`}
              fields={EVENT_PRODUCTION_FIELDS}
              initial={t.eventProduction.info}
              readOnly={false}
              pending={patch.isPending}
              onSave={(info) => patch.mutate({ 'eventProduction.info': info })}
            />
            <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-muted">Contacts</h3>
            <ProductionContactsEditor
              key={`epc-${t.id}`}
              initial={t.eventProduction.contacts}
              readOnly={false}
              pending={patch.isPending}
              onSave={(contacts) => patch.mutate({ 'eventProduction.contacts': contacts })}
            />
            <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-muted">Links</h3>
            <ProductionLinksEditor
              key={`epl-${t.id}`}
              initial={t.eventProduction.links}
              readOnly={false}
              pending={patch.isPending}
              onSave={(links) => patch.mutate({ 'eventProduction.links': links })}
            />
          </Block>

          <Block title="Per-stage production defaults (house package)">
            {t.stages.length === 0 && <p className="text-sm text-ink-muted">Add stages first.</p>}
            {enabledDepts.length === 0 && t.stages.length > 0 && (
              <p className="text-sm text-ink-muted">Enable departments first.</p>
            )}
            {t.stages.map((stage) => (
              <div key={stage.id} className="rounded-lg border border-line p-3">
                <h3 className="mb-2 font-display text-lg font-bold text-brand">{stage.name}</h3>
                {enabledDepts.map((dept) => (
                  <div key={dept.id} className="mb-3">
                    <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">{dept.name}</h4>
                    <SectionContentForm
                      key={`${t.id}-${stage.id}-${dept.id}`}
                      fields={getDepartmentFields(dept.id, 'production')}
                      initial={t.stageProduction[stage.id]?.content?.[dept.id] ?? {}}
                      readOnly={false}
                      pending={patch.isPending}
                      onSave={(content) =>
                        patch.mutate({ [`stageProduction.${stage.id}.content.${dept.id}`]: content })
                      }
                    />
                  </div>
                ))}
              </div>
            ))}
          </Block>
        </>
      )}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-t border-line pt-5">
      <h2 className="font-display text-xl font-bold text-brand">{title}</h2>
      {children}
    </div>
  );
}

function NameField({ initial, pending, onSave }: { initial: string; pending?: boolean; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <div className="flex items-end gap-2">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Template name</span>
        <input
          className="w-72 rounded border border-line px-3 py-2 outline-none focus:border-brand"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={pending || !name.trim()}
        onClick={() => onSave(name.trim())}
        className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Save name
      </button>
    </div>
  );
}

function DepartmentsField({
  all,
  selected,
  pending,
  onSave,
}: {
  all: DepartmentRecord[];
  selected: string[];
  pending?: boolean;
  onSave: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<Set<string>>(() => new Set(selected));
  const toggle = (id: string) =>
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="space-y-2">
      {all.length === 0 ? (
        <p className="text-sm text-ink-muted">No departments configured (seed them in Admin).</p>
      ) : (
        <div className="flex flex-wrap gap-3 text-sm">
          {all.map((d) => (
            <label key={d.id} className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={ids.has(d.id)} onChange={() => toggle(d.id)} />
              {d.name}
            </label>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => onSave(all.filter((d) => ids.has(d.id)).map((d) => d.id))}
        className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Save departments
      </button>
    </div>
  );
}

function ScheduleTemplatesField({
  all,
  selected,
  pending,
  onSave,
}: {
  all: ScheduleTemplate[];
  selected: string[];
  pending?: boolean;
  onSave: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<Set<string>>(() => new Set(selected));
  const toggle = (id: string) =>
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-muted">
        Auto-applied to the schedule when an event is created from this template (you can still import more later).
      </p>
      {all.length === 0 ? (
        <p className="text-sm text-ink-muted">No schedule templates yet (create them in Admin → Schedule templates).</p>
      ) : (
        <div className="space-y-1 text-sm">
          {all.map((st) => (
            <label key={st.id} className="flex items-center gap-2">
              <input type="checkbox" checked={ids.has(st.id)} onChange={() => toggle(st.id)} />
              {st.name}
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-muted">
                {st.kind === 'master' ? 'Master' : scheduleTemplateCategoryLabel(st.category)}
              </span>
              <span className="text-xs text-ink-muted">
                {st.kind === 'master'
                  ? `${st.refs.length} composed`
                  : `${templateItemCount(st)} item${templateItemCount(st) === 1 ? '' : 's'}`}
              </span>
            </label>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => onSave(all.filter((st) => ids.has(st.id)).map((st) => st.id))}
        className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Save schedule templates
      </button>
    </div>
  );
}

function EventLogoField({
  templateId,
  initial,
  pending,
  onSave,
}: {
  templateId: string;
  initial: Logo | null;
  pending?: boolean;
  onSave: (logo: Logo | null) => void;
}) {
  const [logo, setLogo] = useState<Logo>(initial ?? emptyLogo());
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Show-specific mark, cloned onto events created from this template. Provide a variant for
        dark backgrounds, light backgrounds, or both.
      </p>
      <LogoUploader
        logo={logo}
        pathPrefix={`templates/${templateId}/logo`}
        onChange={setLogo}
        disabled={pending}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => onSave(logo)}
        className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Save logo
      </button>
    </div>
  );
}
