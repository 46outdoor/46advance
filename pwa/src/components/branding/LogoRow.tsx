import { useTheme } from '@/contexts/theme-context';
import { hasLogo, logoForBackground, type Logo, type LogoImage } from '@/lib/branding/logo';

interface Props {
  eventLogo: Logo | null;
  defaults: readonly Logo[];
  className?: string;
  /** Height class for the centered event logo (default h-12). */
  eventClassName?: string;
  /** Height class for the flanking company marks (default h-8). */
  markClassName?: string;
}

/**
 * Branding row: the event logo centered + larger, flanked by the shared company marks
 * (smaller, split to each side — e.g. 46 · Event · Peachtree). Theme-aware variant
 * selection. With no event logo, the marks render as a simple centered row; returns null
 * when there's nothing to show.
 */
export function LogoRow({ eventLogo, defaults, className, eventClassName = 'h-12', markClassName = 'h-8' }: Props) {
  const { theme } = useTheme();
  const bg = theme === 'dark' ? 'dark' : 'light';

  const eventImg = hasLogo(eventLogo) ? logoForBackground(eventLogo, bg) : null;
  const markImgs = defaults
    .filter(hasLogo)
    .map((logo) => logoForBackground(logo, bg))
    .filter((img): img is LogoImage => img !== null)
    .slice(0, eventImg ? 2 : 3);

  if (!eventImg && markImgs.length === 0) return null;

  const wrap = `flex items-center justify-center gap-8 ${className ?? ''}`;
  const renderMark = (img: LogoImage) => (
    <img key={img.path} src={img.url} alt="" className={`w-auto object-contain ${markClassName}`} />
  );

  if (!eventImg) {
    return <div className={wrap}>{markImgs.map(renderMark)}</div>;
  }

  const split = Math.ceil(markImgs.length / 2);
  return (
    <div className={wrap}>
      {markImgs.slice(0, split).map(renderMark)}
      <img src={eventImg.url} alt="" className={`w-auto object-contain ${eventClassName}`} />
      {markImgs.slice(split).map(renderMark)}
    </div>
  );
}
