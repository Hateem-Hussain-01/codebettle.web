import { cn } from '@/lib/utils';

/**
 * Course progress bar (Student Progress Tracking) — gold fill on a
 * dark track, with an optional label. Pure presentational component:
 * the % is computed by lib/services/progress-service.ts and passed in.
 */
interface ProgressBarProps {
  /** 0–100. Values outside the range are clamped. */
  percent: number;
  /** Small label shown to the right of the bar (e.g. "50% complete"). */
  label?: string;
  className?: string;
}

export default function ProgressBar({ percent, label, className }: ProgressBarProps) {
  const clamped = Math.min(Math.max(Math.round(percent), 0), 100);
  return (
    <div className={cn('w-full', className)}>
      <div
        className="h-2 w-full rounded-full bg-dark-border overflow-hidden"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `${clamped}% complete`}
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {label && <p className="text-muted text-xs mt-1.5">{label}</p>}
    </div>
  );
}
