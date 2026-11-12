'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from './ThemeProvider';
import type { ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Theme menu (Dark / Light / Default). Follows the dropdown pattern in
 * components/layout/UserMenu.tsx: closes on outside click, on Escape
 * (focus returns to the button), and ArrowUp/ArrowDown move focus
 * between the three options.
 *
 * The button shows the icon of the CURRENT EFFECTIVE theme (Sun when
 * dark, Moon when light). The menu items are radio-style options:
 * Dark (Moon), Light (Sun), Default (Monitor, "Default (system)" —
 * follows the device). The active preference gets a checkmark +
 * active styling. The icon renders only after mount: the server
 * cannot know the theme (cookie / device preference), so rendering
 * an icon during SSR would risk a hydration mismatch on first paint.
 *
 * Controlled when `open` is passed; uncontrolled by default
 * (internal useState). Same component is used in the Navbar (2 spots)
 * and the PortalLayout topbar.
 */

const OPTIONS: { preference: ThemePreference; label: string; Icon: typeof Moon }[] = [
  { preference: 'dark', label: 'Dark', Icon: Moon },
  { preference: 'light', label: 'Light', Icon: Sun },
  { preference: 'system', label: 'Default (system)', Icon: Monitor },
];

interface ThemeToggleProps {
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function ThemeToggle({ className, open, onOpenChange }: ThemeToggleProps) {
  const { preference, theme, setPreference } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? open : internalOpen;
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close on Escape (anywhere while open) and return focus to the button.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const isDark = theme === 'dark';
  const activeLabel = OPTIONS.find((o) => o.preference === preference)?.label ?? 'Default (system)';
  const label = `Theme: ${activeLabel}`;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={label}
        title={label}
        className={cn(
          'text-muted hover:text-foreground transition-colors p-2 rounded-lg hover:bg-dark-border cursor-pointer',
          className
        )}
      >
        {mounted ? (
          isDark ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )
        ) : (
          // Same size as the icon so the header does not shift on mount.
          <span className="block w-5 h-5" aria-hidden="true" />
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label="Theme menu"
            onKeyDown={handleMenuKeyDown}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-56 bg-dark-card border border-dark-border rounded-xl elev-3 z-50 overflow-hidden"
          >
            <div className="py-1">
              {OPTIONS.map(({ preference: option, label: optionLabel, Icon }) => {
                const isActive = preference === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => { setPreference(option); setOpen(false); }}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors w-full cursor-pointer',
                      isActive ? 'text-foreground bg-dark-border' : 'text-muted hover:text-foreground hover:bg-dark-border'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {optionLabel}
                    {isActive && <Check className="w-4 h-4 ml-auto" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
