/**
 * Shared portal search (Eman, 18 Nov 2026 — dashboard follow-up:
 * page transitions, expandable submenus, top-bar search).
 *
 * ONE search implementation, ONE index: the sidebar search (below the
 * profile section) and the top-bar search (PortalLayout header) both
 * search the same thing — the permission-filtered navItems the server
 * layout passed, including submenu children — and they share these
 * helpers so the two surfaces can never drift apart (two competing
 * searches with different results was the thing to avoid).
 *
 * The split between the two surfaces is placement only:
 * - Sidebar search: the nav list itself, below the profile. Best
 *   when the sidebar is the focus (mobile drawer, collapsed rail).
 * - Top-bar search: a dropdown palette in the header. Best on
 *   desktop, where the header is always visible.
 * ⌘K focuses whichever is visible (PortalLayout owns the shortcut
 * and picks: top-bar input on desktop, sidebar input otherwise).
 *
 * Pure helpers only — no Next.js imports here so this module is
 * unit-testable with the plain Node test runner (same pattern as
 * lib/sidebar.ts). Generic over the item type so callers keep their
 * full NavItem (icon, badge) in the hits.
 */

/**
 * The shape search works on. NavItem (components/layout/
 * CollapsibleSidebar.tsx) extends this with its icon + badge — the
 * search never needs those, so it stays structural and testable.
 */
export interface NavItemNode {
  href: string;
  label: string;
  /** Submenu children — real sub-pages only, never invented. */
  children?: NavItemNode[];
}

/** One flattened search hit: the item itself, plus its parent for the breadcrumb. */
export interface NavSearchHit<T extends NavItemNode> {
  item: T;
  /** Parent label when this hit is a submenu child (e.g. "Courses"). */
  parentLabel?: string;
}

/** Flatten a nav tree (parents + children) into searchable hits, in nav order. */
export function flattenNavItems<T extends NavItemNode>(items: readonly T[]): NavSearchHit<T>[] {
  const out: NavSearchHit<T>[] = [];
  for (const item of items) {
    out.push({ item });
    for (const child of item.children ?? []) {
      // Children are NavItemNodes in the base shape; the cast keeps
      // the caller's richer item type (icon, badge) on the hit.
      out.push({ item: child as T, parentLabel: item.label });
    }
  }
  return out;
}

/**
 * One hit matches when the query appears in its label, its href, or
 * (for a child) its parent's label — so "courses" also finds the
 * "New Course" child, and "new" finds it by label.
 */
export function matchesNavHit<T extends NavItemNode>(hit: NavSearchHit<T>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    hit.item.label.toLowerCase().includes(q) ||
    hit.item.href.toLowerCase().includes(q) ||
    (hit.parentLabel?.toLowerCase().includes(q) ?? false)
  );
}

/**
 * Search the nav tree. Empty query returns every hit (the palette
 * doubles as a quick-jump list); a query returns only matches, in
 * nav order. Results are always a subset of the passed navItems —
 * never a hardcoded dummy list, never another role's pages.
 */
export function searchNavItems<T extends NavItemNode>(items: readonly T[], query: string): NavSearchHit<T>[] {
  return flattenNavItems(items).filter((hit) => matchesNavHit(hit, query));
}
