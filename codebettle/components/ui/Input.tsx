import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-sm font-medium text-foreground/80">{label}</label>}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              'w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-muted',
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
