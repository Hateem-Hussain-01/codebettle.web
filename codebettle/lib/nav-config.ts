/**
 * Public navbar config — SERVER-ONLY half (DB fetch).
 *
 * WARNING: never import this file from a Client Component. It imports
 * lib/db/nav-items.ts, which pulls in the Prisma client and the `pg`
 * driver — Node-only code that breaks the browser bundle (Turbopack:
 * "Module not found: Can't resolve 'dns'"; CI run 43732441697,
 * 15 Nov 2026). Client code (Navbar, NavConfigProvider) must import
 * ONLY from ./nav-config-client (pure types + pure helper, zero
 * imports). Only server code may import from here: app/layout.tsx
 * and app/api/nav/route.ts.
 *
 * BUG (Eman, 15 Nov 2026): the navbar used to render its hardcoded
 * fallback items (including 'Instructors') on first paint and while
 * GET /api/nav was in flight, then swap to the saved items once the
 * fetch resolved. On SPA tab-to-tab navigation the Navbar remounts,
 * so a deleted item flashed for a few seconds on EVERY tab click.
 * The fix: the root layout fetches this config server-side and hands
 * it to the Navbar through NavConfigProvider, so the first paint
 * already carries the saved items; the client fetch is only a
 * background revalidation. The hardcoded defaults are used ONLY when
 * the DB truly has no saved config (fromDefaults) — never as a
 * visible placeholder while a saved config is loading.
 */
import { listNavItems } from './db/nav-items';
import { resolveNavItems, DEFAULT_NAV_ITEMS } from './management';
import { getSiteSettings } from './services/settings-service';
import type { PublicNavConfig } from './nav-config-client';

export type { NavItemLink, PublicNavConfig } from './nav-config-client';

/**
 * Resolve the public navbar config from the saved Navbar Editor rows
 * + the navbar logo setting. NEVER throws: on any DB error (table
 * missing, DB unreachable) it returns the hardcoded defaults, so a
 * page rendering the navbar from this config can never 500 on nav
 * data — exactly the fail-safe the client fetch used to provide.
 */
export async function getPublicNavConfig(): Promise<PublicNavConfig> {
  try {
    const [settings, dbItems] = await Promise.all([getSiteSettings(), listNavItems()]);
    const fromDefaults = dbItems.length === 0;
    return {
      items: resolveNavItems(dbItems),
      logoUrl: settings.navbarLogoUrl || undefined,
      fromDefaults,
    };
  } catch {
    return { items: [...DEFAULT_NAV_ITEMS], logoUrl: undefined, fromDefaults: true };
  }
}
