import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { departmentInputSchema } from '@/lib/departments/department';
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  seedDefaultDepartments,
  updateDepartment,
} from '@/lib/departments/departments-service';

const logger = createLogger('Departments');

/** Admin: app-wide department list (events enable a subset). */
export function DepartmentsAdmin() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: listDepartments });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['departments'] });

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const seed = useMutation({
    mutationFn: seedDefaultDepartments,
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to seed departments', err),
  });

  const create = useMutation({
    mutationFn: () =>
      createDepartment(departmentInputSchema.parse({ name }), departmentsQuery.data?.length ?? 0),
    onSuccess: () => {
      void invalidate();
      setName('');
    },
    onError: (err) => logger.error('Failed to create department', err),
  });

  const rename = useMutation({
    mutationFn: (id: string) =>
      updateDepartment(id, departmentInputSchema.parse({ name: editName })),
    onSuccess: () => {
      void invalidate();
      cancelEdit();
    },
    onError: (err) => logger.error('Failed to rename department', err),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDepartment(id),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to delete department', err),
  });

  const departments = departmentsQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-brand">Departments</h2>
        {departmentsQuery.data && departments.length === 0 && (
          <button
            type="button"
            disabled={seed.isPending}
            onClick={() => seed.mutate()}
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {seed.isPending ? 'Seeding…' : 'Seed defaults'}
          </button>
        )}
      </div>

      {departmentsQuery.isLoading && <p className="text-sm text-ink-muted">Loading departments…</p>}
      {departmentsQuery.isError && <p className="text-sm text-accent">Failed to load departments.</p>}

      {departments.length > 0 && (
        <ul className="divide-y divide-line/60 text-sm">
          {departments.map((d) => {
            const isEditing = editingId === d.id;
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                {isEditing ? (
                  <form
                    className="flex flex-1 flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editName.trim()) rename.mutate(d.id);
                    }}
                  >
                    <label className="sr-only" htmlFor={`rename-${d.id}`}>
                      Rename department
                    </label>
                    <input
                      id={`rename-${d.id}`}
                      autoFocus
                      className="min-h-11 w-56 rounded border border-line px-3 py-2 outline-none focus:border-brand"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') cancelEdit();
                      }}
                    />
                    <button
                      type="submit"
                      disabled={rename.isPending || !editName.trim()}
                      className="min-h-11 rounded border border-line px-3 py-2 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      {rename.isPending ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      disabled={rename.isPending}
                      onClick={cancelEdit}
                      className="min-h-11 rounded border border-line px-3 py-2 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="font-medium text-ink">{d.name}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(d.id);
                          setEditName(d.name);
                        }}
                        className="min-h-11 rounded border border-line px-2 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(d.id)}
                        className="min-h-11 rounded border border-line px-2 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Add department</span>
          <input
            className="min-h-11 w-56 rounded border border-line px-3 py-2 outline-none focus:border-brand"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Catering"
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="min-h-11 rounded border border-line px-3 py-2 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
