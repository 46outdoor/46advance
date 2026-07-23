import { useTheme, type Theme } from '@/contexts/theme-context';

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Light/dark appearance control for the Settings page (light content surface). */
export function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-lg border border-line p-1"
    >
      {OPTIONS.map((opt) => {
        const selected = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(opt.value)}
            className={`min-w-[4.5rem] rounded-md px-5 py-1.5 text-sm font-semibold transition-colors ${
              selected ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
