import { useTheme } from '@/contexts/theme-context';
import { effectiveLogos, logoForBackground, type Logo } from '@/lib/branding/logo';

interface Props {
  eventLogo: Logo | null;
  defaults: readonly Logo[];
  className?: string;
  /** Tailwind height class for the marks (default h-8). */
  imgClassName?: string;
}

/**
 * Renders the effective logo row (event logo + shared defaults, ≤ 3), choosing each
 * mark's variant for the current theme so it reads on the content surface (light
 * theme → onLight/dark marks; dark theme → onDark/light marks).
 */
export function LogoRow({ eventLogo, defaults, className, imgClassName }: Props) {
  const { theme } = useTheme();
  const background = theme === 'dark' ? 'dark' : 'light';
  const imgs = effectiveLogos(eventLogo, defaults)
    .map((logo) => logoForBackground(logo, background))
    .filter((img): img is NonNullable<typeof img> => img !== null);

  if (imgs.length === 0) return null;
  return (
    <div className={`flex items-center gap-4 ${className ?? ''}`}>
      {imgs.map((img, i) => (
        <img key={img.path ?? i} src={img.url} alt="" className={`w-auto object-contain ${imgClassName ?? 'h-8'}`} />
      ))}
    </div>
  );
}
