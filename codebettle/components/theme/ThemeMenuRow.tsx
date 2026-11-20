'use client';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { applyThemeWithWipe, elementCenter } from '@/lib/theme-wipe';
import type { ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Compact icon-only theme switcher for the avatar dropdown (UserMenu).
 *
 * Eman, 20 Nov 2026: the theme control moved OUT of Profile settings
 * (its Appearance section had a long overflowing paragraph and its
 * floating menu overlapped the Change Password card) and INTO the
 * avatar dropdown, next to Logout. It is deliberately icon-based,
 * not text: a short "Theme" label and three small icon buttons
 * (Moon = Dark, Sun = Light, Monitor = follow the device). No
 * explanatory paragraph, no long text, and NO nested floating menu —
 * the icons sit inline in the menu so nothing can overflow.
 *
 * Behaviour is exactly the ThemeToggle's: the same useTheme()
 * preference (dark / light / system), cookie-persisted, site-wide,
 * applied immediately. The active option gets the gold treatment.
 *
 * Menu behaviour: picking a theme does NOT close the UserMenu (the
 * row calls setPreference only — Profile/Settings/Logout still close
 * it), so the user sees the change and can pick another. The buttons
 * are radio items, so the menu's ArrowUp/ArrowDown handler (which
 * walks the plain menu items only) steps over the group as one
 * block; Tab still reaches each button.
 */

const OPTIONS: { preference: ThemePreference; label: string; Icon: typeof Moon }[] = [
  { preference: 'dark', label: 'Dark theme', Icon: Moon },
  { preference: 'light', label: 'Light theme', Icon: Sun },
  { preference: 'system', label: 'System theme', Icon: Monitor },
];

export default function ThemeMenuRow() {
  const { preference, setPreference } = useTheme();

  return (
    <div role="group" aria-label="Theme" className="flex items-center justify-between px-4 py-2">
      <span className="text-sm font-medium text-muted">Theme</span>
      <span className="flex items-center gap-1">
        {OPTIONS.map(({ preference: option, label, Icon }) => {
          const isActive = preference === option;
          return (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={isActive}
              aria-label={label}
              title={label}
              onClick={(e) => {
                // Ink-wipe theme switch (Eman, 21 Nov 2026): the new
                // theme spreads as an ink blob from the clicked icon;
                // the menu stays open so the user sees the change and
                // can pick another. Reduced motion / no View
                // Transitions support = instant switch (lib/theme-wipe).
                applyThemeWithWipe(() => setPreference(option), elementCenter(e.currentTarget));
              }}
              className={cn(
                'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors',
                isActive
                  ? 'bg-dark-border text-primary-text'
                  : 'text-muted hover:bg-dark-border hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </span>
    </div>
  );
}
