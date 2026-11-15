'use client';
import { createContext, useContext } from 'react';
import type { PublicNavConfig } from '@/lib/nav-config';

/**
 * Nav config context (navbar flash fix, 15 Nov 2026). The root layout
 * fetches the public nav config server-side (getPublicNavConfig) and
 * provides it here, so the Navbar renders the SAVED items on its
 * first paint instead of hardcoded defaults while GET /api/nav loads.
 * The layout persists across SPA navigations, so the value is already
 * there when a new page's Navbar mounts — no re-flash on tab clicks.
 * Null when the Navbar is rendered outside the layout (tests, or a
 * page that bypasses it): the Navbar then fetches /api/nav and shows
 * a skeleton until it answers.
 */
const NavConfigContext = createContext<PublicNavConfig | null>(null);

export function NavConfigProvider({
  value,
  children,
}: {
  value: PublicNavConfig;
  children: React.ReactNode;
}) {
  return <NavConfigContext.Provider value={value}>{children}</NavConfigContext.Provider>;
}

export function useNavConfig(): PublicNavConfig | null {
  return useContext(NavConfigContext);
}
