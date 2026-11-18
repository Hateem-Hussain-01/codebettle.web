'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, LogOut, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/auth';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /**
   * Unsubmitted-count bubble (Eman, 15 Nov 2026): shown at the right
   * end of the row when > 0 — e.g. the student portal's Assignments
   * item carries the count of visible assignments the student has not
   * submitted yet. Optional: portals that pass no badge (instructor /
   * admin) render exactly as before.
   */
  badge?: number;
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
 *   rests on the active row and glides to the hovered row.
 * - Collapsed tooltips: portaled to document.body (so the scrolling
 *   nav and the clipping aside can never cut them off), positioned
 *   from the hovered row's bounding rect.
 * - Sidebar search (below the profile section): filters the passed
 *   navItems — the pages this user can actually access — with
 *   keyboard navigation (↑/↓/Enter/Esc) and ⌘K to focus.
 */
const EASE_OUT = 'easeOut' as const;
/** House motion duration — matches FadeIn (0.45s ease-out). */
const MOTION_DURATION = 0.45;
/** Gliding highlight spring — TiltCard's critically damped character
 *  (stiffness 200, damping 22, mass 0.6): a slow glide that settles
 *  without overshoot, never the video's snappy bounce. */
const HIGHLIGHT_SPRING = { type: 'spring', stiffness: 200, damping: 22, mass: 0.6 } as const;
/** Labels fade out over 300ms before the rail starts shrinking. */
const COLLAPSE_LABEL_DELAY_MS = 300;
/** Labels start fading in shortly after the rail starts growing. */
const EXPAND_LABEL_DELAY_MS = 150;

function isActiveItem(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

function matchesQuery(item: NavItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return item.label.toLowerCase().includes(q) || item.href.toLowerCase().includes(q);
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
  const results = isSearching ? navItems.filter((item) => matchesQuery(item, query)) : navItems;
  const activeItem = navItems.find((item) => isActiveItem(pathname, item.href));
  // The gliding highlight rests on the active row, follows the hovered
  // row, and (while searching) the keyboard-selected result.
  const highlightedHref =
    hoveredHref ?? (isSearching ? (results[activeResultIndex]?.href ?? null) : (activeItem?.href ?? null));

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

  // ⌘K / Ctrl+K focuses the search (expanding the rail first when collapsed).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (mobile) return;
        if (collapsed) {
          setFocusSearchAfterExpand(true);
          handleToggle();
        } else {
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobile, collapsed, handleToggle]);

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
    const href = results[activeResultIndex]?.href;
    if (href) rowRefs.current.get(href)?.scrollIntoView({ block: 'nearest' });
  }, [isSearching, activeResultIndex, results]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveResultIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveResultIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const target = results[activeResultIndex];
      if (target) {
        if (mobile) onClose();
        router.push(target.href);
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

  const renderNavRow = (item: NavItem, index: number) => {
    const isActive = isActiveItem(pathname, item.href);
    const isHighlighted = highlightedHref === item.href;
    const showBadge = typeof item.badge === 'number' && item.badge > 0;
    const badgeText = showBadge && item.badge !== undefined ? (item.badge > 9 ? '9+' : item.badge) : '';
    return (
      <Link
        key={item.href}
        href={item.href}
        id={isSearching ? `sidebar-result-${item.href}` : undefined}
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
          'relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60',
          effectiveCollapsed ? 'justify-center px-2' : 'px-3',
          isActive ? 'text-primary-text' : 'text-muted hover:text-foreground',
        )}
      >
        {/* Gliding row-highlight pill: rests on the active row, glides
            to the hovered row (or the keyboard-selected search
            result). Plain span under reduced motion. */}
        {isHighlighted &&
          (reduceMotion ? (
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
          ))}
        {/* Icon: FLIP-glides to the centre when the rail collapses. */}
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
        {/* Label: fades with a stagger on expand; out of flow and
            invisible while collapsed so the icon centres. */}
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
          {item.label}
        </span>
        {/* Right end (expanded only): count pill + active chevron. */}
        {!effectiveCollapsed && (isActive || showBadge) && (
          <span className="relative ml-auto flex items-center gap-1.5">
            {showBadge && (
              <span
                aria-label={`${item.badge} unsubmitted`}
                className="min-w-5 h-5 px-1 bg-primary text-ink text-[11px] font-bold rounded-full flex items-center justify-center"
              >
                {badgeText}
              </span>
            )}
            {isActive && <ChevronRight className="h-4 w-4 text-primary-text" />}
          </span>
        )}
      </Link>
    );
  };

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
                isSearching && results[activeResultIndex] ? `sidebar-result-${results[activeResultIndex].href}` : undefined
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
          results.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm font-medium text-foreground">No pages found</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                No pages match &ldquo;{query.trim()}&rdquo;. Try another search.
              </p>
            </div>
          ) : (
            <div id="sidebar-search-results" role="listbox" aria-label="Search results">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {results.length} result{results.length === 1 ? '' : 's'}
              </p>
              {results.map((item, i) => renderNavRow(item, i))}
            </div>
          )
        ) : (
          navItems.map((item, i) => renderNavRow(item, i))
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
    </div>
  );
}
