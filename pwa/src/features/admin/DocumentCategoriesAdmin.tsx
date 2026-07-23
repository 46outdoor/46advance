import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { documentCategoryInputSchema } from '@/lib/documents/documentCategory';
import {
  createDocumentCategory,
  deleteDocumentCategory,
  listDocumentCategories,
  seedDefaultDocumentCategories,
  updateDocumentCategory,
} from '@/lib/documents/document-categories-service';

const logger = createLogger('DocumentCategories');

/** Admin: app-wide document category list (classifies artist + event documents). */
export function DocumentCategoriesAdmin() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const categoriesQuery = useQuery({
    queryKey: ['documentCategories'],
    queryFn: listDocumentCategories,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['documentCategories'] });

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const seed = useMutation({
    mutationFn: seedDefaultDocumentCategories,
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to seed document categories', err),
  });

  const create = useMutation({
    mutationFn: () =>
      createDocumentCategory(
        documentCategoryInputSchema.parse({ name }),
        categoriesQuery.data?.length ?? 0,
      ),
    onSuccess: () => {
      void invalidate();
      setName('');
    },
    onError: (err) => logger.error('Failed to create document category', err),
  });

  const rename = useMutation({
    mutationFn: (id: string) =>
      updateDocumentCategory(id, documentCategoryInputSchema.parse({ name: editName })),
    onSuccess: () => {
      void invalidate();
      cancelEdit();
    },
    onError: (err) => logger.error('Failed to rename document category', err),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDocumentCategory(id),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to delete document category', err),
  });

  const categories = categoriesQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-brand">Document categories</h2>
        {categoriesQuery.data && categories.length === 0 && (
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

      {categoriesQuery.isLoading && <p className="text-sm text-ink-muted">Loading categories…</p>}
      {categoriesQuery.isError && <p className="text-sm text-accent">Failed to load categories.</p>}

      {categories.length > 0 && (
        <ul className="divide-y divide-line/60 text-sm">
          {categories.map((c) => {
            const isEditing = editingId === c.id;
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                {isEditing ? (
                  <form
                    className="flex flex-1 flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editName.trim()) rename.mutate(c.id);
                    }}
                  >
                    <label className="sr-only" htmlFor={`rename-${c.id}`}>
                      Rename category
                    </label>
                    <input
                      id={`rename-${c.id}`}
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
                    <span className="font-medium text-ink">{c.name}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditName(c.name);
                        }}
                        className="min-h-11 rounded border border-line px-2 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(c.id)}
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
          <span className="mb-1 block font-semibold text-ink">Add category</span>
          <input
            className="min-h-11 w-56 rounded border border-line px-3 py-2 outline-none focus:border-brand"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Promo Photos"
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
