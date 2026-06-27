import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './theme-context';

function Probe() {
  const { theme, toggleTheme, setTheme, showSystemDarkNudge } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="nudge">{showSystemDarkNudge ? 'yes' : 'no'}</span>
      <button onClick={toggleTheme}>toggle</button>
      <button onClick={() => setTheme('light')}>set-light</button>
    </div>
  );
}

function mockMatchMedia(prefersDark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: prefersDark,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    mockMatchMedia(false);
  });

  it('defaults to light when nothing is saved', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('reads a saved dark preference and applies the class', () => {
    localStorage.setItem('theme', 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggles theme and persists the choice', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('shows the system-dark nudge only when the OS prefers dark and no choice is saved', () => {
    mockMatchMedia(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('nudge').textContent).toBe('yes');
    expect(screen.getByTestId('theme').textContent).toBe('light'); // default stays light
  });

  it('suppresses the nudge once a choice is saved, even if the OS prefers dark', () => {
    mockMatchMedia(true);
    localStorage.setItem('theme', 'light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('nudge').textContent).toBe('no');
  });

  it('choosing a theme dismisses the nudge', () => {
    mockMatchMedia(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('nudge').textContent).toBe('yes');
    fireEvent.click(screen.getByText('set-light'));
    expect(screen.getByTestId('nudge').textContent).toBe('no');
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
