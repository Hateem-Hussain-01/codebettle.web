import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-sm font-medium text-white/80">{label}</label>}
        <select
          ref={ref}
          className={cn(
            'w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-white',
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
