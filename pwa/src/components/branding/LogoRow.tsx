import { useTheme } from '@/contexts/theme-context';
import { hasLogo, logoForBackground, type Logo, type LogoImage } from '@/lib/branding/logo';

/**
 * One shared scale for every logo row so the branding reads the same everywhere:
 * the event logo is 2× the mark height, each mark sits in an equal fixed-width slot
 * (keeping mark centers equidistant from the event logo and stopping wide wordmarks
 * outweighing compact marks), and the gap is half the event height. `sm` is exactly
 * half of `md`. The packet PDF mirrors these ratios (functions/src/lib/pdf/packet.tsx).
 */
const SIZES = {
  md: { gap: 'gap-12', event: 'h-24', mark: 'h-12 w-44' },
  sm: { gap: 'gap-6', event: 'h-12', mark: 'h-6 w-22' },
} as const;

interface Props {
  eventLogo: Logo | null;
  defaults: readonly Logo[];
  className?: string;
  /** Overall scale of the row; every size shares the same relative proportions (default 'md'). */
  size?: keyof typeof SIZES;
}

/**
 * Branding row: the event logo centered + larger, flanked by the shared company marks
 * (smaller, split to each side — e.g. 46 · Event · Peachtree). Theme-aware variant
 * selection. With no event logo, the marks render as a simple centered row; returns null
 * when there's nothing to show.
 */
export function LogoRow({ eventLogo, defaults, className, size = 'md' }: Props) {
  const { theme } = useTheme();
  const bg = theme === 'dark' ? 'dark' : 'light';
  const scale = SIZES[size];

  const eventImg = hasLogo(eventLogo) ? logoForBackground(eventLogo, bg) : null;
  const markImgs = defaults
    .filter(hasLogo)
    .map((logo) => logoForBackground(logo, bg))
    .filter((img): img is LogoImage => img !== null)
    .slice(0, eventImg ? 2 : 3);

  if (!eventImg && markImgs.length === 0) return null;

  const wrap = `flex items-center justify-center ${scale.gap} ${className ?? ''}`;
  const renderMark = (img: LogoImage) => (
    <img key={img.path} src={img.url} alt="" className={`object-contain ${scale.mark}`} />
  );

  if (!eventImg) {
    return <div className={wrap}>{markImgs.map(renderMark)}</div>;
  }

  const split = Math.ceil(markImgs.length / 2);
  return (
    <div className={wrap}>
      {markImgs.slice(0, split).map(renderMark)}
      <img src={eventImg.url} alt="" className={`w-auto object-contain ${scale.event}`} />
      {markImgs.slice(split).map(renderMark)}
    </div>
  );
}
