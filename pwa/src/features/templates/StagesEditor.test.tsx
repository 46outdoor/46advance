import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StagesEditor } from './StagesEditor';
import type { TemplateStage } from '@/lib/templates/template';

const stages: TemplateStage[] = [
  { id: 'a', name: 'Main', order: 0 },
  { id: 'b', name: 'Side', order: 1 },
  { id: 'c', name: 'Acoustic', order: 2 },
];

function renderEditor() {
  const onSave = vi.fn();
  render(<StagesEditor initial={stages} onSave={onSave} />);
  return { onSave };
}

describe('StagesEditor reorder', () => {
  it('moves a stage down and persists the reordered array with derived order', () => {
    const { onSave } = renderEditor();
    // Move the first stage ("Main") down past "Side".
    fireEvent.click(screen.getAllByLabelText('Move stage down')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save stages' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as TemplateStage[];
    expect(saved.map((s) => s.name)).toEqual(['Side', 'Main', 'Acoustic']);
    // Order is re-derived from list position on save.
    expect(saved.map((s) => s.order)).toEqual([0, 1, 2]);
    // Stage ids stay stable through the move.
    expect(saved.map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('moves a stage up and persists the reordered array', () => {
    const { onSave } = renderEditor();
    // Move the last stage ("Acoustic") up past "Side".
    fireEvent.click(screen.getAllByLabelText('Move stage up')[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Save stages' }));

    const saved = onSave.mock.calls[0][0] as TemplateStage[];
    expect(saved.map((s) => s.name)).toEqual(['Main', 'Acoustic', 'Side']);
    expect(saved.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('disables "up" on the first stage and "down" on the last', () => {
    renderEditor();
    const up = screen.getAllByLabelText('Move stage up');
    const down = screen.getAllByLabelText('Move stage down');

    expect(up[0]).toBeDisabled();
    expect(up[1]).not.toBeDisabled();
    expect(up[2]).not.toBeDisabled();

    expect(down[0]).not.toBeDisabled();
    expect(down[1]).not.toBeDisabled();
    expect(down[2]).toBeDisabled();
  });

  it('keeps boundary buttons correct after a reorder', () => {
    renderEditor();
    // After moving the first stage down, the new first stage's "up" is disabled.
    fireEvent.click(screen.getAllByLabelText('Move stage down')[0]);

    const up = screen.getAllByLabelText('Move stage up');
    const down = screen.getAllByLabelText('Move stage down');
    expect(up[0]).toBeDisabled();
    expect(down[down.length - 1]).toBeDisabled();
  });
});
