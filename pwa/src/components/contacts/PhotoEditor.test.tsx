import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { PhotoEditor } from './PhotoEditor';

vi.mock('react-easy-crop', () => ({
  default: () => <div data-testid="crop-surface" />,
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'user-1' } }),
}));

vi.mock('@/lib/storage/uploads', () => ({
  deleteFile: vi.fn(),
  uploadFile: vi.fn(),
  validateUpload: vi.fn(() => null),
}));

vi.mock('@/lib/storage/image', () => ({
  downscaleImage: vi.fn(),
}));

const photo = {
  path: 'contacts/photos/user-1/photo.jpg',
  url: 'https://example.test/photo.jpg',
  crop: { x: 0, y: 0, width: 100, height: 100, natW: 100, natH: 100 },
};

describe('PhotoEditor crop dialog', () => {
  it('traps focus, closes on Escape, restores the opener, and passes axe', async () => {
    const { container } = render(<PhotoEditor photo={photo} name="Pat Lee" onChange={vi.fn()} />);
    const opener = screen.getByRole('button', { name: 'Reframe' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Crop photo' });
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(
      (await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toEqual([]);

    const zoom = screen.getByRole('slider', { name: 'Zoom' });
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(zoom).toHaveFocus();

    zoom.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(save).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Crop photo' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
