'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { parseThemeCookie, parseThemePreference, resolveTheme, themeCookieString, type Theme, type ThemePreference } from '@/lib/theme';

interface ThemeContextValue {
  /** The saved preference: an explicit theme, or 'system' (follow the device). */
  preference: ThemePreference;
  /** The effective theme actually applied (device-resolved when preference is 'system'). */
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The saved preference for the first client render. The cookie is the
 * source of truth: the `data-theme` attribute only ever holds the
 * EFFECTIVE theme, so a 'system' cookie cannot be recovered from it.
 * No cookie (or an invalid one) means 'system'. Server render (no
 * document) falls back to 'system' — the toggle guards its icon
 * behind a mounted check, so that fallback never produces a
 * hydration mismatch.
 */
function initialPreference(): ThemePreference {
  if (typeof document === 'undefined') return 'system';
  const match = document.cookie.match(/(?:^|;\s*)cb-theme=(light|dark|system)/);
  return parseThemePreference(match?.[1]) ?? 'system';
}

/**
 * Initial effective theme for the first client render. The
 * pre-hydration inline script (THEME_SCRIPT in lib/theme.ts) has
 * already set `data-theme` on <html> from the cookie or the device
 * preference before React hydrates, so reading the attribute here
 * agrees with what the user already sees. Server render (no
 * document) falls back to dark.
 */
function initialTheme(preference: ThemePreference): Theme {
  if (typeof document === 'undefined') return 'dark';
  return (
    parseThemeCookie(document.documentElement.getAttribute('data-theme')) ??
    resolveTheme(preference, window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
}

/** Apply an effective theme to <html> (attribute + colorScheme for native controls). */
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  // The lazy initializer runs in this same render, so `preference`
  // already holds the initial value — no second cookie parse.
  const [theme, setEffectiveTheme] = useState<Theme>(() => initialTheme(preference));

  const setPreference = useCallback((next: ThemePreference) => {
    const effective = resolveTheme(next, window.matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(effective);
    document.cookie = themeCookieString(next);
    setPreferenceState(next);
    setEffectiveTheme(effective);
  }, []);

  // When the preference is 'system', follow the OS theme live: if the
  // device switches dark <-> light while the tab is open, the
  // effective theme follows. (Explicit dark/light preferences ignore
  // the OS entirely, so there is nothing to subscribe to.) The sync
  // on subscribe also covers a device change between the
  // pre-hydration script and hydration.
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (prefersDark: boolean) => {
      const effective = resolveTheme('system', prefersDark);
      applyTheme(effective);
      setEffectiveTheme(effective);
    };
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    apply(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
