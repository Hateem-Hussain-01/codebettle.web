import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
}

export default function Card({ children, className, hover, glow }: CardProps) {
  return (
    <div className={cn(
      'bg-dark-card border border-dark-border rounded-xl p-6',
      // Phase 6: hoverable cards get the subtle 3D lift (translate + layered
      // shadow). card-lift carries its own transition for transform, shadow
      // and border-color, so no separate transition-all is needed here.
      hover && 'card-lift hover:border-primary/40',
      glow && 'hover:shadow-[0_0_20px_rgba(245,197,24,0.15)]',
      className
    )}>
      {children}
    </div>
  );
}
