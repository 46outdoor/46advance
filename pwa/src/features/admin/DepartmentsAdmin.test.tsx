import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DepartmentsAdmin } from '@/features/admin/DepartmentsAdmin';
import type { DepartmentRecord } from '@/lib/departments/department';

const listDepartments = vi.fn<() => Promise<DepartmentRecord[]>>();
const updateDepartment = vi.fn<(id: string, input: { name: string }) => Promise<void>>();

// Avoid real Firebase: stub the departments data-access lib.
vi.mock('@/lib/departments/departments-service', () => ({
  listDepartments: () => listDepartments(),
  updateDepartment: (id: string, input: { name: string }) => updateDepartment(id, input),
  createDepartment: vi.fn(),
  deleteDepartment: vi.fn(),
  seedDefaultDepartments: vi.fn(),
}));

function renderAdmin() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DepartmentsAdmin />
    </QueryClientProvider>,
  );
}

describe('DepartmentsAdmin rename', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDepartments.mockResolvedValue([{ id: 'audio', name: 'Audio', order: 0 }]);
    updateDepartment.mockResolvedValue(undefined);
  });

  it('renames a department, submitting the trimmed value', async () => {
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));

    const input = screen.getByLabelText('Rename department');
    fireEvent.change(input, { target: { value: '  Audio Crew  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateDepartment).toHaveBeenCalledTimes(1));
    expect(updateDepartment).toHaveBeenCalledWith('audio', { name: 'Audio Crew' });
  });

  it('disables Save and rejects an empty/whitespace name', async () => {
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));

    const input = screen.getByLabelText('Rename department');
    fireEvent.change(input, { target: { value: '   ' } });

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(updateDepartment).not.toHaveBeenCalled();
  });

  it('cancels editing without calling updateDepartment', async () => {
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Rename department')).not.toBeInTheDocument();
    expect(updateDepartment).not.toHaveBeenCalled();
  });
});
