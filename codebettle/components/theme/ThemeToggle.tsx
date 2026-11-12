'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';

/**
 * Light/dark toggle. Sun means "currently dark, tap for light" (and
 * vice versa) — the icon shows what you will switch TO, matching the
 * label. The icon renders only after mount: the server cannot know
 * the theme (cookie / device preference), so rendering an icon during
 * SSR would risk a hydration mismatch on first paint.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = theme === 'dark';
  const label = mounted
    ? isDark
      ? 'Switch to light mode'
      : 'Switch to dark mode'
    : 'Toggle theme';

  return (
    <button
      type="button"
      onClick={toggleTheme}
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
  );
}
