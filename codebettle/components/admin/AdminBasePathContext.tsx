'use client';

import { createContext, useContext } from 'react';

/**
 * Admin base path, for client components inside the admin portal
 * (PR #33).
 *
 * The secret admin base path (e.g. `portal-xK9...`) is server-only
 * knowledge — it must never be bundled into public JS. The portal
 * layout (a server component) reads it from the env var and hands it
 * down through this provider, so admin client components can build
 * links without ever touching process.env. The provider is only ever
 * rendered inside a portal layout, so the value only reaches browsers
 * that are already inside the admin portal.
 *
 * Default `admin` (the dev default) is used when no provider is
 * present — e.g. in tests — so existing behaviour is unchanged.
 */
const AdminBasePathContext = createContext<string>('admin');

export function AdminBasePathProvider({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return <AdminBasePathContext.Provider value={value}>{children}</AdminBasePathContext.Provider>;
}

/** The admin base path (first URL segment) for this portal render. */
export function useAdminBasePath(): string {
  return useContext(AdminBasePathContext);
}

/**
 * Build an admin URL from the context base path.
 * useAdminUrl()('/courses/new') → `/<base>/courses/new`.
 */
export function useAdminUrl(): (path: string) => string {
  const base = useAdminBasePath();
  return (path: string) => {
    const p = path.startsWith('/') ? path : `/${path}`;
    return p === '/' ? `/${base}` : `/${base}${p}`;
  };
}
