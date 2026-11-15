/**
 * Public navbar config — the single server-side source of truth for
 * what the navbar shows (Navbar Editor rows + navbar logo setting).
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
