import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBeforeUnload } from './useBeforeUnload';

describe('useBeforeUnload', () => {
  afterEach(() => vi.restoreAllMocks());

  it('registers a beforeunload listener only while active, and removes it when it turns off', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');

    const { rerender, unmount } = renderHook(({ active }) => useBeforeUnload(active), {
      initialProps: { active: false },
    });
    expect(add).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));

    rerender({ active: true });
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    rerender({ active: false });
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    unmount();
  });
});
