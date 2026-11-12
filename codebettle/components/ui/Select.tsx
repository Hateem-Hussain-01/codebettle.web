import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  /**
   * Inline styles for the <label> — see Input's labelStyle: the label
   * class fixes its colour, so a recoloured form passes it here.
   */
  labelStyle?: React.CSSProperties;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, labelStyle, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-sm font-medium text-foreground/80" style={labelStyle}>{label}</label>}
        <select
          ref={ref}
          className={cn(
            'w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all cursor-pointer',
            'disabled:opacity-50',
            error && 'border-red-500',
            className
          )}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-dark-card">
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
export default Select;
