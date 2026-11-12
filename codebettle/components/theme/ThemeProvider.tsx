'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { parseThemeCookie, themeCookieString, toggleTheme, type Theme } from '@/lib/theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Initial theme for the first client render. The pre-hydration inline
 * script (THEME_SCRIPT in lib/theme.ts) has already set `data-theme`
 * on <html> from the cookie or the device preference before React
 * hydrates, so reading the attribute here agrees with what the user
 * already sees. Server render (no document) falls back to dark — the
 * toggle guards its icon behind a mounted check, so that fallback
 * never produces a hydration mismatch.
 */
function initialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return parseThemeCookie(document.documentElement.getAttribute('data-theme')) ?? 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute('data-theme', next);
    document.cookie = themeCookieString(next);
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(toggleTheme(theme));
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme: toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
