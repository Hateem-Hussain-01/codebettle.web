/**
 * Public navbar config — CLIENT-SAFE half (pure types + pure helper).
 *
 * This file MUST stay import-free: it must never import anything from
 * lib/db, lib/services, lib/management, or any other module that (even
 * transitively) pulls in Prisma / the `pg` driver. The Navbar is a
 * Client Component ('use client'), so everything it imports lands in
 * the browser bundle — and `pg` needs Node built-ins (dns, fs, net,
 * tls) that do not exist in the browser. Importing the server half
 * (lib/nav-config.ts) from the Navbar broke the production build
 * exactly this way (Turbopack: "Module not found: Can't resolve
 * 'dns'" via pg -> @prisma/orm-postgres -> src/prisma/db.ts ->
 * lib/db/client.ts -> lib/db/nav-items.ts -> lib/nav-config.ts ->
 * components/layout/Navbar.tsx; CI run 43732441697, 15 Nov 2026).
 *
 * Server code (getPublicNavConfig) lives in lib/nav-config.ts and
 * imports these types from here. Client code imports ONLY from here.
 */
export interface NavItemLink {
  label: string;
  href: string;
}

export interface PublicNavConfig {
  items: NavItemLink[];
  logoUrl: string | undefined;
  /**
   * True when no nav config is saved in the DB (empty NavItem table)
   * — the items are the hardcoded defaults. False whenever the admin
   * has saved anything (even if every item is disabled, in which case
   * items is [] and the navbar correctly shows no links).
   */
  fromDefaults: boolean;
}

/**
 * The navbar's first-paint items. Precedence: an explicit prop wins,
 * then the server-provided config, then NOTHING (still loading — the
 * Navbar renders a skeleton, not links). The hardcoded defaults are
 * NEVER returned here: returning them while loading is exactly what
 * flashed a deleted item (e.g. Instructors) on every navigation.
 * The defaults reach the screen only via a server config whose
 * fromDefaults is true, or via the fetch-failure fallback in the
 * Navbar when there was never anything else to show.
 */
export function resolveNavbarInitialItems(
  navItemsProp: NavItemLink[] | undefined,
  serverConfig: PublicNavConfig | null,
): NavItemLink[] {
  if (navItemsProp) return navItemsProp;
  if (serverConfig) return serverConfig.items;
  return [];
}
