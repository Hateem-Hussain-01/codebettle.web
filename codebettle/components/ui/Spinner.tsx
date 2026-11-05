import { cn } from '@/lib/utils';

export default function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('w-8 h-8 border-2 border-dark-border border-t-primary rounded-full animate-spin', className)} />
  );
}
