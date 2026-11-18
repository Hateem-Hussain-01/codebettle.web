import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  /**
   * V32 glass surface (Dashboard V32, 18 Nov 2026): a subtle glass
   * treatment — the dark-card surface at 70% opacity with a backdrop
   * blur, a soft shadow and the larger 2xl radius from the reference's
   * `glass-card p-6 rounded-2xl`. Token colours only, so it reads in
   * both themes (dark-card is near-black in dark, white in light).
   * Opt-in: dashboards pass it; every other caller keeps the solid
   * card. `cn` is a plain join (not tailwind-merge), so the glass
   * branch REPLACES the solid background/radius below instead of
   * adding a conflicting class next to it.
   */
  glass?: boolean;
  /**
   * Inline styles for the card element. Inline styles beat the
   * `bg-dark-card` class, so callers (e.g. the form builder live
   * preview, the styled public form) can recolour a card without a
   * new variant. Absent = the default dark card.
   */
  style?: React.CSSProperties;
}

export default function Card({ children, className, hover, glow, glass, style }: CardProps) {
  return (
    <div className={cn(
      'border border-dark-border p-6',
      glass
        ? 'bg-dark-card/70 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.20)]'
        : 'bg-dark-card rounded-xl',
      // Phase 6: hoverable cards get the subtle 3D lift (translate + layered
      // shadow). card-lift carries its own transition for transform, shadow
      // and border-color, so no separate transition-all is needed here.
      // The lift is CodeBettle's own — translateY(-2px) over 0.25s ease —
      // not the reference video's literal whileHover y:-5 (see the
      // motion correction, 18 Nov 2026: the video is a reference only).
      hover && 'card-lift hover:border-primary/40',
      glow && 'hover:shadow-[0_0_20px_rgba(245,197,24,0.15)]',
      className
    )}
    style={style}>
      {children}
    </div>
  );
}
