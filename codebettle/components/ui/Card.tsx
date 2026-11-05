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
      hover && 'hover:border-primary/40 transition-all duration-300',
      glow && 'hover:shadow-[0_0_20px_rgba(245,197,24,0.15)]',
      className
    )}>
      {children}
    </div>
  );
}
