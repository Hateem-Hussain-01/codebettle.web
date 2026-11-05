import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-sm font-medium text-white/80">{label}</label>}
        <textarea
          ref={ref}
          className={cn(
            'w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-muted resize-none',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all',
            'disabled:opacity-50',
            error && 'border-red-500',
            className
          )}
          rows={4}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
export default Textarea;
