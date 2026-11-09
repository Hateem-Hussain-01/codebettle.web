'use client';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  /**
   * Phase 6 — selective neon accent (travelling gold border arc).
   * Opt-in and reserved for high-value actions only: hero CTA,
   * Enroll Now, Start quiz, Publish quiz, Submit quiz. Do not set
   * this on ordinary buttons — restraint is the design rule.
   */
  neon?: boolean;
}

export default function Button({
  variant = 'primary', size = 'md', loading, fullWidth, neon, className, children, disabled, ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

  const variants = {
    primary: 'bg-primary text-dark hover:bg-primary-dark active:scale-95 glow-sm',
    secondary: 'bg-dark-card text-white hover:bg-dark-border border border-dark-border active:scale-95',
    outline: 'border border-primary text-primary hover:bg-primary hover:text-dark active:scale-95',
    ghost: 'text-muted hover:text-white hover:bg-dark-card active:scale-95',
    danger: 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 active:scale-95',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3',
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', neon && 'neon-btn', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
