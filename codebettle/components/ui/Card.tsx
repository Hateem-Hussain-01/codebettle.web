import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  /**
   * Inline styles for the card element. Inline styles beat the
   * `bg-dark-card` class, so callers (e.g. the form builder live
   * preview, the styled public form) can recolour a card without a
   * new variant. Absent = the default dark card.
   */
  style?: React.CSSProperties;
}

export default function Card({ children, className, hover, glow, style }: CardProps) {
  return (
    <div className={cn(
      'bg-dark-card border border-dark-border rounded-xl p-6',
      // Phase 6: hoverable cards get the subtle 3D lift (translate + layered
      // shadow). card-lift carries its own transition for transform, shadow
      // and border-color, so no separate transition-all is needed here.
      hover && 'card-lift hover:border-primary/40',
      glow && 'hover:shadow-[0_0_20px_rgba(245,197,24,0.15)]',
      className
    )}
    style={style}>
      {children}
    </div>
  );
}
