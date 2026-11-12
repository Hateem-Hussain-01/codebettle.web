import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  /**
   * Inline styles for the <label> — see Input's labelStyle: the label
   * class fixes its colour, so a recoloured form passes it here.
   */
  labelStyle?: React.CSSProperties;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, labelStyle, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-sm font-medium text-foreground/80" style={labelStyle}>{label}</label>}
        <textarea
          ref={ref}
          className={cn(
            'w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-muted resize-none',
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
