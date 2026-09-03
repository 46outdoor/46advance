/**
 * `useViewer` is the single construction point for the `Viewer` object, so its job is
 * narrow and total: carry EVERY global capability through, and be null exactly when signed
 * out. The completeness case below is the one that matters — the hook exists because a
 * hand-built literal dropped a claim silently (see `EventContactsPanel.crossEvent.test.tsx`),
 * and `Viewer`'s optional flags mean the compiler will never catch a repeat.
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANONYMOUS_VIEWER, useViewer } from './useViewer';

const auth = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  isAdmin: false,
  isOrganizer: false,
  isProductionDirector: false,
  isProductionCoordinator: false,
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => auth }));

beforeEach(() => {
  auth.user = { uid: 'user-1' };
  auth.isAdmin = false;
  auth.isOrganizer = false;
  auth.isProductionDirector = false;
  auth.isProductionCoordinator = false;
});

describe('useViewer', () => {
  it('carries every global capability from the auth context', () => {
    auth.isAdmin = true;
    auth.isOrganizer = true;
    auth.isProductionDirector = true;
    auth.isProductionCoordinator = true;

    const { result } = renderHook(() => useViewer());

    // Compared whole, not field-by-field: a missing key is exactly the failure mode, and an
    // assertion per field would still pass if a NEW capability were dropped.
    expect(result.current).toEqual({
      uid: 'user-1',
      isAdmin: true,
      isOrganizer: true,
      isProductionDirector: true,
      isProductionCoordinator: true,
    });
  });

  it('reports every capability as false for a plain approved user', () => {
    const { result } = renderHook(() => useViewer());

    expect(result.current).toEqual({
      uid: 'user-1',
      isAdmin: false,
      isOrganizer: false,
      isProductionDirector: false,
      isProductionCoordinator: false,
    });
  });

  it('is null when signed out', () => {
    auth.user = null;

    const { result } = renderHook(() => useViewer());

    expect(result.current).toBeNull();
  });

  it('keeps a stable identity across re-renders', () => {
    // The viewer feeds query keys (`eventsListKey`) and effect deps at several call sites; a
    // fresh object each render would churn them.
    const { result, rerender } = renderHook(() => useViewer());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it('returns a new viewer when a claim changes', () => {
    const { result, rerender } = renderHook(() => useViewer());
    const before = result.current;

    auth.isProductionCoordinator = true;
    rerender();

    expect(result.current).not.toBe(before);
    expect(result.current?.isProductionCoordinator).toBe(true);
  });
});

describe('ANONYMOUS_VIEWER', () => {
  it('holds no capability', () => {
    expect(ANONYMOUS_VIEWER).toEqual({
      uid: '',
      isAdmin: false,
      isOrganizer: false,
      isProductionDirector: false,
      isProductionCoordinator: false,
    });
  });

  it('is frozen, so a consumer cannot grant itself a capability through the shared object', () => {
    expect(Object.isFrozen(ANONYMOUS_VIEWER)).toBe(true);
  });
});
