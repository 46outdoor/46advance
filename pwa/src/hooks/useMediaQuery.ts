import { useEffect, useState } from 'react';

/**
 * Read a CSS media query from JavaScript, and stay subscribed to it.
 *
 * This exists because some responsive decisions cannot be expressed as a Tailwind variant. The
 * header's navigation is the motivating case: its two presentations must be *mutually exclusive
 * in the DOM*, not merely one-hidden-by-CSS, because two `<nav>` landmarks sharing the name
 * "Main navigation" is an accessibility defect and because jsdom applies no Tailwind, so a
 * CSS-hidden duplicate would make every component-test query ambiguous. Rendering one branch or
 * the other requires the breakpoint as a boolean at render time — hence this hook.
 *
 * SSR/non-browser safe: with no `window` (or no `matchMedia`, as in older jsdom) it reports
 * `false` and never subscribes. Callers must therefore arrange for `false` to be the safe
 * fallback presentation — mobile-first, in practice.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMatches(query));

  useEffect(() => {
    const list = matchMediaOrNull(query);
    if (!list) return;
    // Re-sync on subscribe rather than trusting the value the initial render captured: `query`
    // may have changed, and the viewport can move between that render and this effect.
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => {
      list.removeEventListener('change', onChange);
    };
  }, [query]);

  return matches;
}

function matchMediaOrNull(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query);
}

function readMatches(query: string): boolean {
  return matchMediaOrNull(query)?.matches ?? false;
}
