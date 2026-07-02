import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type Theme, type ThemeContextValue } from './theme-context';

const STORAGE_KEY = 'theme';

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * App theme (light/dark). Default is **light**; the user's choice is persisted to
 * localStorage and applied as a `dark` class on `<html>` (an inline script in
 * index.html applies it before first paint to avoid a flash). If the OS prefers
 * dark and no choice is saved yet, `showSystemDarkNudge` invites a one-time switch.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStored() ?? 'light');
  const [showSystemDarkNudge, setShowSystemDarkNudge] = useState<boolean>(
    () => readStored() === null && systemPrefersDark(),
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const setTheme = useCallback((next: Theme): void => {
    setThemeState(next);
    setShowSystemDarkNudge(false); // any explicit choice ends the nudge for good
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private mode) — theme still applies this session
    }
  }, []);

  // Memoized so consumers don't re-render on every ThemeProvider render (only when theme/nudge change).
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      showSystemDarkNudge,
    }),
    [theme, showSystemDarkNudge, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
