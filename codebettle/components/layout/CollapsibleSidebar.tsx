'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchNavItems, type NavItemNode } from '@/lib/nav-search';
import type { SessionUser } from '@/lib/auth';

export interface NavItem extends NavItemNode {
  icon: React.ReactNode;
  /**
   * Unsubmitted-count bubble (Eman, 15 Nov 2026): shown at the right
   * end of the row when > 0 — e.g. the student portal's Assignments
   * item carries the count of visible assignments the student has not
   * submitted yet. Optional: portals that pass no badge (instructor /
   * admin) render exactly as before.
   */
  badge?: number;
  /**
   * Submenu children (Eman, 18 Nov 2026 — dashboard follow-up).
   * Real sub-pages ONLY, passed by the server layout — the admin
   * layout attaches the static sub-routes that exist under an area
   * (e.g. Courses → New Course). Student / instructor / team have
   * no static sub-pages (their only nested routes are dynamic
   * [id] detail pages), so their items carry no children and render
   * exactly as before. Never invented, never another role's pages.
   */
  children?: NavItem[];
}

interface CollapsibleSidebarProps {
  user: SessionUser;
  navItems: NavItem[];
  pathname: string;
  portalName: string;
  /** Desktop collapsed state, owned by PortalLayout (persisted in a cookie). Ignored on mobile. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onLogout: () => void;
  /** Mobile drawer mode: always expanded, no collapse toggle. */
  mobile?: boolean;
  onClose: () => void;
  /**
   * ⌘K focus signal (dashboard follow-up): PortalLayout owns the
   * ⌘K shortcut now (one owner for the two search surfaces) and
   * bumps this counter when the sidebar search should take focus
   * (top-bar input hidden — mobile drawer, collapsed rail).
   * 0 = never signalled; every bump re-fires the focus effect.
   */
  focusSearchSignal?: number;
}

/**
 * Premium animated collapsible sidebar (Eman, 18 Nov 2026 — "Glassy
 * SideBar V5" video). One implementation for every portal: the four
 * server layouts pass their own permission-filtered navItems and this
 * component only ever renders those — nav items are never mixed
 * between roles.
 *
 * Interaction (borrowed from the video, look kept dark + gold):
 * - Two states: expanded (w-64, icons + labels) / collapsed (w-20
 *   icon rail). The width lives on the <aside> in PortalLayout; this
 *   component owns the content and the label sequencing.
 * - Motion (Eman, 18 Nov 2026 — motion correction: the video is ONLY
 *   a reference, the motion is CodeBettle's own): slow, elegant,
 *   damped — FadeIn's 0.45s ease-out, critically damped springs like
 *   TiltCard, no bounce. NOT the video's fast expo glide.
 * - Labels fade out first, then the rail shrinks (and the reverse on
 *   expand: the rail grows, then labels fade in with a stagger). The
 *   two states are sequenced with short timeouts so neither step
 *   jumps; under reduced motion both steps happen instantly.
 * - Gliding row highlight: a single framer-motion layoutId pill that
 *   rests on the active row and glides to the hovered row — on a fast
 *   critically damped spring (~0.1s settle, Eman 20 Nov 2026: the old
 *   slow spring lagged a full row behind the cursor) so the pill sits
 *   on the hovered row at every step, plus an instant hover background
 *   on the row itself that lights up on the same frame the cursor
 *   arrives.
 * - Collapsed tooltips: portaled to document.body (so the scrolling
 *   nav and the clipping aside can never cut them off), positioned
 *   from the hovered row's bounding rect.
 * - Sidebar search (below the profile section): filters the passed
 *   navItems — the pages this user can actually access — with
 *   keyboard navigation (↑/↓/Enter/Esc) and ⌘K to focus. The
 *   matching lives in lib/nav-search.ts, SHARED with the top-bar
 *   search (dashboard follow-up): one index, one matcher, two
 *   surfaces — the two searches can never disagree about what
 *   exists. PortalLayout owns the ⌘K shortcut and signals this
 *   component (focusSearchSignal) when the sidebar search should
 *   take focus.
 * - Expandable submenus (dashboard follow-up): a nav item with
 *   children (real sub-pages from the server layout, admin only
 *   today) expands inline with a chevron when the rail is expanded,
 *   and opens a portaled flyout when the rail is collapsed. The
 *   submenu of the active page opens on its own, so the user always
 *   sees where they are.
 */
const EASE_OUT = 'easeOut' as const;
/** House motion duration — matches FadeIn (0.45s ease-out). */
const MOTION_DURATION = 0.45;
/** Gliding highlight spring — the pill must TRACK the cursor: it
 *  rests on the active row and glides to the hovered row at every
 *  step as the pointer moves down the list (Eman, 20 Nov 2026 — the
 *  old spring, stiffness 200 / damping 22, settled in ~0.2s per hop,
 *  so the pill lagged a full row behind the cursor while it moved).
 *  stiffness 800 / damping 40 / mass 0.5 is still critically damped
 *  (damping ratio ~1.0) so it settles without overshoot, but it
 *  settles in ~0.1s — fast enough to sit on the hovered row at every
 *  step, slow enough to read as a glide rather than a snap. NOT the
 *  video's snappy bounce — no overshoot, no expo curve. */
const HIGHLIGHT_SPRING = { type: 'spring', stiffness: 800, damping: 40, mass: 0.5 } as const;
/** Labels fade out over 300ms before the rail starts shrinking. */
const COLLAPSE_LABEL_DELAY_MS = 300;
/** Labels start fading in shortly after the rail starts growing. */
const EXPAND_LABEL_DELAY_MS = 150;

function isActiveItem(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

/** Parents whose child is active start expanded, so the user sees where they are. */
function initiallyOpenSubmenus(navItems: NavItem[], pathname: string): Set<string> {
  const open = new Set<string>();
  for (const item of navItems) {
    if (item.children?.some((child) => isActiveItem(pathname, child.href))) {
      open.add(item.href);
    }
  }
  return open;
}

/** Collapsed-rail tooltip, portaled to <body> so nothing clips it. */
function SidebarTooltip({ anchor }: { anchor: { top: number; left: number; text: string } | null }) {
  if (typeof document === 'undefined' || !anchor) return null;
  return createPortal(
    <div
      role="tooltip"
      aria-hidden="true"
      className="pointer-events-none fixed z-[70] -translate-y-1/2 whitespace-nowrap rounded-lg border border-dark-border bg-dark-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-[0_8px_24px_-6px_rgba(0,0,0,0.6)]"
      style={{ top: anchor.top, left: anchor.left }}
    >
      {anchor.text}
    </div>,
    document.body,
  );
}

/** Collapsed-rail submenu flyout, portaled to <body> so the scrolling nav and the clipping aside can never cut it off. */
function SubmenuFlyout({
  anchor,
  parent,
  activeHref,
  onNavigate,
  onClose,
}: {
  anchor: { top: number; left: number } | null;
  parent: NavItem | null;
  activeHref: string | null;
  onNavigate: () => void;
  onClose: () => void;
}) {
  if (typeof document === 'undefined' || !anchor || !parent) return null;
  // The flyout's first row is the parent page itself: in the
  // collapsed rail the parent row is a button (it opens this flyout),
  // so without this row the parent page would be unreachable.
  const rows = [{ href: parent.href, label: parent.label }, ...(parent.children ?? [])];
  return createPortal(
    <div
      role="menu"
      aria-label={`${parent.label} submenu`}
      className="fixed z-[70] w-56 rounded-xl border border-dark-border bg-dark-card py-2 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
      style={{ top: anchor.top, left: anchor.left }}
    >
      {rows.map((row) => {
        const isActive = activeHref === row.href;
        return (
          <Link
            key={row.href}
            href={row.href}
            role="menuitem"
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
              isActive ? 'text-primary-text' : 'text-muted hover:bg-dark-border/60 hover:text-foreground',
            )}
          >
            {row.label}
            {isActive && <ChevronRight className="ml-auto h-4 w-4 text-primary-text" />}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close submenu"
        className="mt-1 flex w-full cursor-pointer items-center justify-center gap-1 border-t border-dark-border px-4 pt-2 text-xs text-muted transition-colors hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" /> Close
      </button>
    </div>,
    document.body,
  );
}

export default function CollapsibleSidebar({
  user,
  navItems,
  pathname,
  portalName,
  collapsed,
  onToggleCollapsed,
  onLogout,
  mobile = false,
  onClose,
  focusSearchSignal = 0,
}: CollapsibleSidebarProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  // Mobile drawer is always expanded — the collapsed state is a
  // desktop concern only.
  const effectiveCollapsed = mobile ? false : collapsed;
  const [labelsVisible, setLabelsVisible] = useState(mobile ? true : !collapsed);
  const [query, setQuery] = useState('');
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [tooltip, setTooltip] = useState<{ top: number; left: number; text: string } | null>(null);
  const [focusSearchAfterExpand, setFocusSearchAfterExpand] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLAnchorElement>());
  const seqTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSearching = query.trim().length > 0;
  // One shared index (lib/nav-search.ts): the flat hits, parents +
  // children, in nav order. While searching the list renders these
  // hits; while idle it renders the tree below.
  const hits = searchNavItems(navItems, query);
  const activeItem = navItems.find((item) => isActiveItem(pathname, item.href));
  // The gliding highlight rests on the DEEPEST active row: a child
  // when the user is on a sub-page, otherwise its parent.
  const activeHref =
    activeItem?.children?.find((child) => isActiveItem(pathname, child.href))?.href ?? activeItem?.href ?? null;
  // The gliding highlight rests on the active row, follows the hovered
  // row, and (while searching) the keyboard-selected result.
  const highlightedHref =
    hoveredHref ?? (isSearching ? (hits[activeResultIndex]?.item.href ?? null) : activeHref);

  // Expandable submenus: which parents are open. Parents of the
  // active page start open; navigating onto a sub-page opens its
  // parent too, so the user always sees where they are. A manual
  // close is respected until the next navigation onto that parent's
  // pages.
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(() => initiallyOpenSubmenus(navItems, pathname));
  const toggleSubmenu = useCallback((href: string) => {
    setOpenSubmenus((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }, []);
  useEffect(() => {
    setOpenSubmenus((prev) => {
      const next = new Set(prev);
      for (const item of navItems) {
        if (item.children?.some((child) => isActiveItem(pathname, child.href))) {
          next.add(item.href);
        }
      }
      return next;
    });
  }, [pathname, navItems]);

  // Collapsed-rail submenu flyout: which parent it shows, and its
  // anchor rect (from the hovered row, like the tooltips).
  const [flyout, setFlyout] = useState<{ top: number; left: number; parent: NavItem } | null>(null);
  const closeFlyout = useCallback(() => setFlyout(null), []);
  // The flyout closes on navigation, on rail expand, and on Esc /
  // outside click (listeners below, only while it is open).
  useEffect(() => {
    setFlyout(null);
  }, [pathname, effectiveCollapsed]);
  useEffect(() => {
    if (!flyout) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFlyout();
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Clicks inside the flyout, or on its trigger button, do not
      // close it here — the trigger's own click toggles it shut.
      if (target.closest('[role="menu"]') || target.closest('[data-flyout-trigger]')) return;
      closeFlyout();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [flyout, closeFlyout]);

  // Clear any pending label-sequencing timeout (rapid toggling).
  const clearSeqTimeout = () => {
    if (seqTimeoutRef.current) {
      clearTimeout(seqTimeoutRef.current);
      seqTimeoutRef.current = null;
    }
  };
  useEffect(() => clearSeqTimeout, []);

  // Clear the search when navigating — the layout stays mounted across
  // SPA navigation inside a portal, so a stale query would otherwise
  // keep filtering the nav after the user already left.
  useEffect(() => {
    setQuery('');
    setActiveResultIndex(0);
  }, [pathname]);

  // Focus the search input after expanding from the collapsed search icon.
  useEffect(() => {
    if (!effectiveCollapsed && focusSearchAfterExpand) {
      searchInputRef.current?.focus();
      setFocusSearchAfterExpand(false);
    }
  }, [effectiveCollapsed, focusSearchAfterExpand]);

  // Hide a stale tooltip when the rail state changes (its anchor moved).
  useEffect(() => {
    setTooltip(null);
  }, [effectiveCollapsed]);

  /**
   * Collapse/expand toggle with label sequencing: on collapse the
   * labels fade out first and the rail shrinks after; on expand the
   * rail grows first and the labels fade in (staggered) after. Under
   * reduced motion both steps happen at once, instantly.
   */
  const handleToggle = useCallback(() => {
    clearSeqTimeout();
    if (reduceMotion) {
      onToggleCollapsed();
      setLabelsVisible(collapsed);
      return;
    }
    if (collapsed) {
      onToggleCollapsed();
      seqTimeoutRef.current = setTimeout(() => setLabelsVisible(true), EXPAND_LABEL_DELAY_MS);
    } else {
      setLabelsVisible(false);
      seqTimeoutRef.current = setTimeout(() => onToggleCollapsed(), COLLAPSE_LABEL_DELAY_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, onToggleCollapsed, reduceMotion]);

  // ⌘K focus signal (dashboard follow-up): PortalLayout owns the
  // ⌘K shortcut now — one owner for the two search surfaces — and
  // bumps focusSearchSignal when the sidebar search should take
  // focus (top-bar input hidden: mobile drawer, collapsed rail).
  // The desktop instance answers only on desktop widths: below lg
  // it is hidden (hidden lg:flex) and the mobile drawer answers
  // instead, so a signal must never toggle the hidden rail's
  // persisted preference.
  useEffect(() => {
    if (focusSearchSignal === 0) return;
    if (!mobile && typeof window !== 'undefined' && window.innerWidth < 1024) return;
    if (collapsed) {
      setFocusSearchAfterExpand(true);
      handleToggle();
    } else {
      searchInputRef.current?.focus();
    }
  }, [focusSearchSignal, mobile, collapsed, handleToggle]);

  // Collapsed search icon: expand the rail, then focus the input.
  const handleSearchIconClick = () => {
    setFocusSearchAfterExpand(true);
    handleToggle();
  };

  const showTooltipFor = (el: HTMLElement, text: string) => {
    if (!effectiveCollapsed) return;
    const rect = el.getBoundingClientRect();
    setTooltip({ top: rect.top + rect.height / 2, left: rect.right + 12, text });
  };
  const hideTooltip = () => setTooltip(null);

  // Keep the keyboard-selected search result in view.
  useEffect(() => {
    if (!isSearching) return;
    const href = hits[activeResultIndex]?.item.href;
    if (href) rowRefs.current.get(href)?.scrollIntoView({ block: 'nearest' });
  }, [isSearching, activeResultIndex, hits]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveResultIndex((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveResultIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const target = hits[activeResultIndex];
      if (target) {
        if (mobile) onClose();
        router.push(target.item.href);
      }
    } else if (e.key === 'Escape') {
      if (query) {
        setQuery('');
        setActiveResultIndex(0);
      } else {
        e.currentTarget.blur();
      }
    }
  };

  const renderNavRow = (item: NavItem, index: number, parentLabel?: string) => {
    const isActive = isActiveItem(pathname, item.href);
    const isHighlighted = highlightedHref === item.href;
    const showBadge = typeof item.badge === 'number' && item.badge > 0;
    const badgeText = showBadge && item.badge !== undefined ? (item.badge > 9 ? '9+' : item.badge) : '';
    const hasChildren = (item.children?.length ?? 0) > 0;
    const submenuOpen = openSubmenus.has(item.href);
    const rowId = isSearching ? `sidebar-result-${item.href}` : undefined;

    // The gliding row-highlight pill (shared by every row shape).
    const highlight = isHighlighted ? (
      reduceMotion ? (
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-0 rounded-lg',
            isActive ? 'border border-primary/20 bg-primary/10' : 'bg-dark-border/60',
          )}
        />
      ) : (
        <motion.span
          aria-hidden="true"
          layoutId="sidebar-nav-highlight"
          transition={HIGHLIGHT_SPRING}
          className={cn(
            'absolute inset-0 rounded-lg',
            isActive ? 'border border-primary/20 bg-primary/10' : 'bg-dark-border/60',
          )}
        />
      )
    ) : null;

    const icon = (
      <motion.span
        layout
        transition={reduceMotion ? { duration: 0 } : { duration: MOTION_DURATION, ease: EASE_OUT }}
        className={cn(
          'relative flex h-5 w-5 shrink-0 items-center justify-center',
          isActive ? 'text-primary-text' : 'text-muted',
        )}
      >
        {item.icon}
        {/* Collapsed: the count becomes a dot on the icon (video pattern). */}
        {effectiveCollapsed && showBadge && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-dark-card"
          />
        )}
      </motion.span>
    );

    const label = (
      <span
        className={cn(
          'min-w-0 flex-1 truncate transition-opacity duration-300',
          effectiveCollapsed ? 'absolute left-11 top-1/2 w-0 -translate-y-1/2 opacity-0' : 'relative',
          labelsVisible ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          transitionDelay:
            !effectiveCollapsed && labelsVisible && !reduceMotion ? `${Math.min(index * 30, 240)}ms` : '0ms',
        }}
      >
        {/* Search hit on a submenu child: the parent as a breadcrumb. */}
        {parentLabel && <span className="text-muted">{parentLabel} / </span>}
        {item.label}
      </span>
    );

    const badge = !effectiveCollapsed && showBadge && (
      <span
        aria-label={`${item.badge} unsubmitted`}
        className="min-w-5 h-5 px-1 bg-primary text-ink text-[11px] font-bold rounded-full flex items-center justify-center"
      >
        {badgeText}
      </span>
    );

    // Parent with children, collapsed rail: the row is a BUTTON that
    // opens the portaled flyout (a Link would navigate away at once).
    // The flyout's first row is the parent page itself, so it stays
    // reachable.
    if (hasChildren && effectiveCollapsed) {
      return (
        <button
          key={item.href}
          type="button"
          id={rowId}
          ref={(el) => {
            if (el) rowRefs.current.set(item.href, el as unknown as HTMLAnchorElement);
            else rowRefs.current.delete(item.href);
          }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setFlyout((prev) =>
              prev?.parent.href === item.href
                ? null
                : { top: rect.top, left: rect.right + 12, parent: item },
            );
          }}
          onMouseEnter={(e) => {
            setHoveredHref(item.href);
            showTooltipFor(e.currentTarget, item.label);
          }}
          onMouseLeave={() => {
            setHoveredHref(null);
            hideTooltip();
          }}
          aria-label={item.label}
          aria-haspopup="true"
          aria-expanded={flyout?.parent.href === item.href}
          data-flyout-trigger={item.href}
          className={cn(
            'relative flex w-full cursor-pointer items-center gap-3 rounded-lg py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60',
            'justify-center px-2 hover:bg-dark-border/40',
            isActive ? 'text-primary-text' : 'text-muted hover:text-foreground',
          )}
        >
          {highlight}
          {icon}
          {label}
        </button>
      );
    }

    // Parent with children, expanded rail / mobile drawer: the row is
    // a Link to the parent page plus a chevron BUTTON that toggles
    // the submenu — the two targets stay separate, so expanding
    // never navigates and navigating never expands.
    if (hasChildren) {
      return (
        <div
          key={item.href}
          onMouseEnter={() => setHoveredHref(item.href)}
          onMouseLeave={() => {
            setHoveredHref(null);
            hideTooltip();
          }}
          // Instant hover background (Eman, 20 Nov 2026): the row
          // under the cursor lights up on the same frame, while the
          // gliding pill catches up in ~0.1s — the hover never reads
          // as lagging. The pill (absolute inset-0) covers this
          // background once it arrives.
          className="relative rounded-lg hover:bg-dark-border/40"
        >
          {highlight}
          <div className="relative flex items-center gap-3 rounded-lg py-2.5 pl-3 pr-1.5 text-sm font-medium">
            <Link
              href={item.href}
              id={rowId}
              ref={(el) => {
                if (el) rowRefs.current.set(item.href, el);
                else rowRefs.current.delete(item.href);
              }}
              onClick={() => {
                if (mobile) onClose();
              }}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-lg',
                isActive ? 'text-primary-text' : 'text-muted hover:text-foreground',
              )}
            >
              {icon}
              {label}
            </Link>
            {badge}
            <button
              type="button"
              onClick={() => toggleSubmenu(item.href)}
              aria-label={`${submenuOpen ? 'Collapse' : 'Expand'} ${item.label} submenu`}
              aria-expanded={submenuOpen}
              className="relative flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-dark-border hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <motion.span
                animate={{ rotate: submenuOpen ? 180 : 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: MOTION_DURATION, ease: EASE_OUT }}
                className="flex items-center justify-center"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        id={rowId}
        ref={(el) => {
          if (el) rowRefs.current.set(item.href, el);
          else rowRefs.current.delete(item.href);
        }}
        onClick={() => {
          if (mobile) onClose();
        }}
        onMouseEnter={(e) => {
          setHoveredHref(item.href);
          if (effectiveCollapsed) {
            showTooltipFor(e.currentTarget, showBadge ? `${item.label} · ${badgeText}` : item.label);
          }
        }}
        onMouseLeave={() => {
          setHoveredHref(null);
          hideTooltip();
        }}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          // Instant hover background (Eman, 20 Nov 2026): the row
          // under the cursor lights up on the same frame, while the
          // gliding pill catches up in ~0.1s — the hover never reads
          // as lagging. The pill (absolute inset-0) covers this
          // background once it arrives.
          'relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium outline-none transition-colors hover:bg-dark-border/40 focus-visible:ring-2 focus-visible:ring-primary/60',
          effectiveCollapsed ? 'justify-center px-2' : 'px-3',
          isActive ? 'text-primary-text' : 'text-muted hover:text-foreground',
        )}
      >
        {/* Gliding row-highlight pill: rests on the active row, glides
            to the hovered row (or the keyboard-selected search
            result). Plain span under reduced motion. */}
        {highlight}
        {/* Icon: FLIP-glides to the centre when the rail collapses. */}
        {icon}
        {/* Label: fades with a stagger on expand; out of flow and
            invisible while collapsed so the icon centres. */}
        {label}
        {/* Right end (expanded only): count pill + active chevron. */}
        {!effectiveCollapsed && (isActive || showBadge) && (
          <span className="relative ml-auto flex items-center gap-1.5">
            {badge}
            {isActive && <ChevronRight className="h-4 w-4 text-primary-text" />}
          </span>
        )}
      </Link>
    );
  };

  // The nav tree: parents render their row; an open parent renders
  // its children indented under a hairline, expanding with the house
  // 0.45s ease-out (instant under reduced motion). One level only —
  // the layouts pass at most one level of children.
  const renderNavTree = (items: NavItem[]) =>
    items.map((item, i) => {
      const hasChildren = (item.children?.length ?? 0) > 0;
      const isOpen = openSubmenus.has(item.href);
      return (
        <div key={item.href}>
          {renderNavRow(item, i)}
          {hasChildren && !effectiveCollapsed && (
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key={`submenu-${item.href}`}
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: MOTION_DURATION, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <div className="ml-5 space-y-1 border-l border-dark-border py-1 pl-2">
                    {(item.children ?? []).map((child, j) => renderNavRow(child, j))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      );
    });

  return (
    <div className="flex h-full flex-col">
      {/* Header: logo + collapse toggle (desktop-only toggle). */}
      <div
        className={cn(
          'flex items-center border-b border-dark-border py-5',
          effectiveCollapsed ? 'px-2' : 'px-4',
        )}
      >
        {mobile ? (
          <>
            <Link href="/" className="text-xl font-black gradient-text">
              CodeBettle
            </Link>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="ml-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-dark-border hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </>
        ) : effectiveCollapsed ? (
          <div className="flex w-full items-center justify-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-black text-ink"
            >
              C
            </span>
            <button
              onClick={handleToggle}
              aria-expanded={false}
              aria-label="Expand sidebar"
              onMouseEnter={(e) => showTooltipFor(e.currentTarget, 'Expand sidebar')}
              onMouseLeave={hideTooltip}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dark-border text-muted outline-none transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <motion.span
                animate={{ rotate: 180 }}
                transition={reduceMotion ? { duration: 0 } : { duration: MOTION_DURATION, ease: EASE_OUT }}
                className="flex items-center justify-center"
              >
                <ChevronLeft className="h-4 w-4" />
              </motion.span>
            </button>
          </div>
        ) : (
          <>
            <Link href="/" className="text-xl font-black gradient-text">
              CodeBettle
            </Link>
            <button
              onClick={handleToggle}
              aria-expanded={true}
              aria-label="Collapse sidebar"
              className="ml-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-dark-border text-muted outline-none transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <motion.span
                animate={{ rotate: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: MOTION_DURATION, ease: EASE_OUT }}
                className="flex items-center justify-center"
              >
                <ChevronLeft className="h-4 w-4" />
              </motion.span>
            </button>
          </>
        )}
      </div>

      {/* Profile / name section. */}
      <div className={cn('border-b border-dark-border py-4', effectiveCollapsed ? 'px-2' : 'px-4')}>
        <div className={cn('relative flex items-center gap-3', effectiveCollapsed && 'justify-center')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`}
            alt={user.name}
            className="h-9 w-9 shrink-0 rounded-full border-2 border-primary/40 object-cover"
            onMouseEnter={(e) => effectiveCollapsed && showTooltipFor(e.currentTarget, `${user.name} — ${portalName}`)}
            onMouseLeave={hideTooltip}
          />
          <div
            className={cn(
              'min-w-0 transition-opacity duration-300',
              effectiveCollapsed ? 'absolute opacity-0' : 'relative',
              labelsVisible ? 'opacity-100' : 'opacity-0',
            )}
          >
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="text-xs capitalize text-muted">{portalName}</p>
          </div>
        </div>
      </div>

      {/* Global sidebar search: the pages this user can access. */}
      <div className="border-b border-dark-border px-3 py-3">
        {effectiveCollapsed ? (
          <button
            onClick={handleSearchIconClick}
            aria-label="Search pages"
            onMouseEnter={(e) => showTooltipFor(e.currentTarget, 'Search pages')}
            onMouseLeave={hideTooltip}
            className="mx-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-muted outline-none transition-colors hover:bg-dark-border hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Search className="h-5 w-5" />
          </button>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveResultIndex(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search pages"
              aria-label="Search pages"
              role="combobox"
              aria-expanded={isSearching}
              aria-controls="sidebar-search-results"
              aria-activedescendant={
                isSearching && hits[activeResultIndex] ? `sidebar-result-${hits[activeResultIndex].item.href}` : undefined
              }
              className={cn(
                'w-full rounded-lg border border-dark-border bg-surface py-2 pl-9 pr-12 text-sm text-foreground outline-none transition-[border-color,opacity] duration-300 placeholder:text-muted focus:border-primary/50',
                labelsVisible ? 'opacity-100' : 'opacity-0',
              )}
            />
            {query ? (
              <button
                onClick={() => {
                  setQuery('');
                  setActiveResultIndex(0);
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-dark-border px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                ⌘K
              </kbd>
            )}
          </div>
        )}
      </div>

      {/* Navigation: the passed navItems only — never another role's. */}
      <nav
        aria-label={`${portalName} navigation`}
        onScroll={hideTooltip}
        className={cn('flex-1 space-y-1 overflow-y-auto py-4', effectiveCollapsed ? 'px-2' : 'px-3')}
      >
        {isSearching ? (
          hits.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm font-medium text-foreground">No pages found</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                No pages match &ldquo;{query.trim()}&rdquo;. Try another search.
              </p>
            </div>
          ) : (
            <div id="sidebar-search-results" role="listbox" aria-label="Search results">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {hits.length} result{hits.length === 1 ? '' : 's'}
              </p>
              {hits.map((hit, i) => renderNavRow(hit.item, i, hit.parentLabel))}
            </div>
          )
        ) : (
          renderNavTree(navItems)
        )}
      </nav>

      {/* Sign Out. */}
      <div className="border-t border-dark-border px-3 py-4">
        <button
          onClick={onLogout}
          aria-label="Sign Out"
          onMouseEnter={(e) => effectiveCollapsed && showTooltipFor(e.currentTarget, 'Sign Out')}
          onMouseLeave={hideTooltip}
          className={cn(
            'relative flex w-full cursor-pointer items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-muted outline-none transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:ring-2 focus-visible:ring-primary/60',
            effectiveCollapsed ? 'justify-center px-0' : 'px-3',
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span
            className={cn(
              'truncate transition-opacity duration-300',
              effectiveCollapsed ? 'absolute opacity-0' : 'relative',
              labelsVisible ? 'opacity-100' : 'opacity-0',
            )}
          >
            Sign Out
          </span>
        </button>
      </div>

      <SidebarTooltip anchor={effectiveCollapsed ? tooltip : null} />
      {/* Collapsed-rail submenu flyout (dashboard follow-up). */}
      <SubmenuFlyout
        anchor={flyout ? { top: flyout.top, left: flyout.left } : null}
        parent={flyout?.parent ?? null}
        activeHref={activeHref}
        onNavigate={closeFlyout}
        onClose={closeFlyout}
      />
    </div>
  );
}
