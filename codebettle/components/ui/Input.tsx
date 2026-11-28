import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  /**
   * Compact density — smaller label, tighter label gap and shorter
   * field — for the auth forms only, so the sign-in / sign-up pages
   * fit on one screen without scrolling (Eman, 28 Nov 2026).
   * Default (false) is unchanged everywhere else.
   */
  compact?: boolean;
  /**
   * Inline styles for the <label>. The label's `text-foreground/80`
   * class fixes its colour, so callers that recolour a form (e.g. the
   * styled public form) pass the text colour here instead.
   */
  labelStyle?: React.CSSProperties;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, labelStyle, compact = false, className, ...props }, ref) => {
    return (
      <div className={`flex flex-col ${compact ? 'gap-1' : 'gap-1.5'}`}>
        {label && <label className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-foreground/80`} style={labelStyle}>{label}</label>}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              `w-full bg-dark-card border border-dark-border rounded-lg px-4 ${compact ? 'py-2' : 'py-2.5'} text-sm text-foreground placeholder-muted`,
              'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              icon ? 'pl-10' : '',
              error ? 'border-red-500 focus:ring-red-500/50' : '',
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
