import { useEffect, useState } from 'react';

/**
 * Default thresholds for the shrinking header, deliberately far apart.
 *
 * The header is `sticky top-0`, and a sticky element still occupies space in normal flow. When it
 * collapses it gets ~40px shorter (padding `py-5`→`py-2` = 24px, logo `h-12`→`h-8` = 16px), the
 * document shortens, and the browser reduces `window.scrollY` to match. With a single threshold
 * that is a feedback loop: cross it → collapse → scrollY drops back under it → expand → scrollY
 * rises past it again, flickering every frame. It's worst on pages barely taller than the viewport,
 * where the collapse is a large share of the total scroll range.
 *
 * So ENTER and EXIT are separated by more than the collapse height: collapsing at 64px leaves
 * scrollY around 24px, comfortably above EXIT; expanding at 16px lifts it to about 56px, still
 * below ENTER. Neither transition can trigger its own reversal. Keep the gap > ~40px if the
 * header's collapsed/expanded sizes change.
 */
const ENTER_PX = 64;
const EXIT_PX = 16;

/**
 * True once the window has scrolled far enough to shrink the header, with hysteresis so the
 * header's own resize can't toggle it back. Reads are coalesced to one per animation frame —
 * scroll fires far more often than the page can paint.
 */
export function useScrolled(enter: number = ENTER_PX, exit: number = EXIT_PX): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;

    const read = () => {
      frame = 0;
      const y = window.scrollY;
      // Only the crossing that matters for the current state is considered; between the two
      // thresholds the header keeps whatever size it already has.
      setScrolled((was) => (was ? y > exit : y > enter));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(read);
    };

    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enter, exit]);

  return scrolled;
}
