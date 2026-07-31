import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { getDocs, updateDoc, writeBatch, type DocumentData } from 'firebase/firestore';
import { getDefaultTemplate, setDefaultTemplate } from './templates-service';

// Mock the Firestore app handle so no real Firebase is initialized.
vi.mock('@/services/firebase', () => ({ db: {} }));

// Keep the real `firebase/firestore` (template.ts's schema needs `Timestamp`); only
// stub the IO entry points the service uses. `doc()` returns its path and
// `serverTimestamp()` a sentinel string so batch writes are assertable by value.
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(() => ({ id: 'templates' })),
    doc: vi.fn((_db: unknown, path: string, id: string) => ({ path: `${path}/${id}` })),
    getDocs: vi.fn(),
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(() => 'server-ts'),
    writeBatch: vi.fn(),
  };
});

const mockGetDocs = getDocs as unknown as Mock;
const mockUpdateDoc = updateDoc as unknown as Mock;
const mockWriteBatch = writeBatch as unknown as Mock;

interface TemplateFixture {
  id: string;
  name: string;
  isDefault?: boolean;
}

/** Minimal `getDocs` result: enough shape for `listTemplates` → `parseTemplate`. */
function templatesSnapshot(...templates: TemplateFixture[]) {
  return {
    docs: templates.map((t) => ({
      id: t.id,
      data: (): DocumentData => ({ name: t.name, isDefault: t.isDefault ?? false }),
    })),
  };
}

interface BatchWrite {
  path: string;
  data: DocumentData;
}

describe('templates-service default flag', () => {
  let writes: BatchWrite[];
  let commit: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    writes = [];
    commit = vi.fn().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: (ref: { path: string }, data: DocumentData) => {
        writes.push({ path: ref.path, data });
      },
      commit,
    });
  });

  it('promotes the target and demotes the previous default in one batch', async () => {
    mockGetDocs.mockResolvedValue(
      templatesSnapshot({ id: 'a', name: 'Amphitheater' }, { id: 'b', name: 'Ballroom', isDefault: true }),
    );

    await setDefaultTemplate('a', true);

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([
      { path: 'templates/a', data: { isDefault: true, updatedAt: 'server-ts' } },
      { path: 'templates/b', data: { isDefault: false, updatedAt: 'server-ts' } },
    ]);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('leaves templates that were never flagged untouched', async () => {
    mockGetDocs.mockResolvedValue(
      templatesSnapshot({ id: 'a', name: 'Amphitheater' }, { id: 'b', name: 'Ballroom' }),
    );

    await setDefaultTemplate('a', true);

    expect(writes).toEqual([{ path: 'templates/a', data: { isDefault: true, updatedAt: 'server-ts' } }]);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('re-flagging the current default does not demote itself', async () => {
    mockGetDocs.mockResolvedValue(templatesSnapshot({ id: 'a', name: 'Amphitheater', isDefault: true }));

    await setDefaultTemplate('a', true);

    expect(writes).toEqual([{ path: 'templates/a', data: { isDefault: true, updatedAt: 'server-ts' } }]);
  });

  it('clearing the flag writes only the target, no batch', async () => {
    await setDefaultTemplate('a', false);

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { path: 'templates/a' },
      { isDefault: false, updatedAt: 'server-ts' },
    );
    expect(mockWriteBatch).not.toHaveBeenCalled();
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('getDefaultTemplate returns the flagged template', async () => {
    mockGetDocs.mockResolvedValue(
      templatesSnapshot({ id: 'a', name: 'Amphitheater' }, { id: 'b', name: 'Ballroom', isDefault: true }),
    );

    const found = await getDefaultTemplate();

    expect(found?.id).toBe('b');
    expect(found?.isDefault).toBe(true);
  });

  it('getDefaultTemplate returns null when nothing is flagged', async () => {
    mockGetDocs.mockResolvedValue(
      templatesSnapshot({ id: 'a', name: 'Amphitheater' }, { id: 'b', name: 'Ballroom' }),
    );

    expect(await getDefaultTemplate()).toBeNull();
  });
});
