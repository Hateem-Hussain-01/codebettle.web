import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
  className?: string;
}

export default function Badge({ children, variant = 'muted', className }: BadgeProps) {
  const variants = {
    primary: 'bg-primary/20 text-primary-text border border-primary/30',
    success: 'bg-green-500/20 text-green-400 border border-green-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    danger: 'bg-red-500/20 text-red-400 border border-red-500/30',
    info: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    muted: 'bg-dark-card text-muted border border-dark-border',
  };

  return (
    <span className={cn('inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full', variants[variant], className)}>
      {children}
    </span>
  );
}
