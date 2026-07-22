import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObservabilityDiagnostics } from '@/features/admin/ObservabilityDiagnostics';

const captureError = vi.fn();
vi.mock('@/lib/errorCapture', () => ({ captureError: (...args: unknown[]) => captureError(...args) }));

const isSentryActive = vi.fn<() => boolean>();
vi.mock('@/lib/sentry', () => ({ isSentryActive: () => isSentryActive() }));

describe('ObservabilityDiagnostics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows "not configured" and disables the test button when Sentry is inactive', () => {
    isSentryActive.mockReturnValue(false);
    render(<ObservabilityDiagnostics />);
    expect(screen.getByText('not configured')).toBeTruthy();
    const btn = screen.getByRole('button', { name: /send a test event/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('sends a production-safe captured test event and confirms when active', () => {
    isSentryActive.mockReturnValue(true);
    render(<ObservabilityDiagnostics />);
    const btn = screen.getByRole('button', { name: /send a test event/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);

    fireEvent.click(btn);

    expect(captureError).toHaveBeenCalledOnce();
    const [err, ctx] = captureError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(ctx).toMatchObject({ source: 'AdminDiagnostics', test: true });
    expect(screen.getByText(/test event sent/i)).toBeTruthy();
  });
});
