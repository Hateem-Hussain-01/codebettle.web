'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchNavItems, type NavItemNode } from '@/lib/nav-search';

interface TopBarSearchProps {
  /** The same permission-filtered navItems the sidebar renders. */
  navItems: NavItemNode[];
  /** PortalLayout's ref — ⌘K focuses this input (see PortalLayout). */
  inputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * Top-bar search (Eman, 18 Nov 2026 — dashboard follow-up).
 *
 * The header's quick-jump palette. It searches the SAME index as
 * the sidebar search — lib/nav-search.ts, the permission-filtered
 * navItems including submenu children — so the two surfaces can
 * never disagree about what exists. The split is placement only:
 * this one lives in the header (always visible on desktop); the
 * sidebar one lives below the profile (mobile drawer, collapsed
 * rail). There is exactly one index and one ⌘K owner (PortalLayout).
 *
 * Behaviour: empty query shows every page (quick-jump list);
 * typing filters by label, href, or parent label; ↑/↓ move,
 * Enter navigates, Esc closes (and clears a query first). The
 * dropdown closes on navigation, on an outside click, or on Esc.
 * Results are real routes only — never a hardcoded list, never
 * another role's pages.
 */
export default function TopBarSearch({ navItems, inputRef }: TopBarSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const resultRefs = useRef(new Map<string, HTMLButtonElement>());

  const results = searchNavItems(navItems, query);
  const isSearching = query.trim().length > 0;

  // Close + reset on navigation — the layout stays mounted across
  // SPA navigation, so a stale query would otherwise keep the
  // dropdown open on the page the user already left.
  useEffect(() => {
    setQuery('');
    setOpen(false);
    setActiveIndex(0);
  }, [pathname]);

  // Outside click closes the dropdown (a document listener, not a
  // fixed overlay: the header's backdrop-blur makes fixed
  // descendants position relative to the header, so an overlay
  // would only cover the header itself).
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open ]);

  // Keep the keyboard-selected result in view.
  useEffect(() => {
    if (!open) return;
    const href = results[activeIndex]?.item.href;
    if (href) resultRefs.current.get(href)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, results]);

  const navigateTo = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const target = results[activeIndex];
      if (target) navigateTo(target.item.href);
    } else if (e.key === 'Escape') {
      if (query) {
        setQuery('');
        setActiveIndex(0);
      } else {
        setOpen(false);
        e.currentTarget.blur();
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search pages"
        aria-label="Search pages"
        role="combobox"
        aria-expanded={open}
        aria-controls="topbar-search-results"
        aria-activedescendant={open && results[activeIndex] ? `topbar-result-${results[activeIndex].item.href}` : undefined}
        className="w-full rounded-lg border border-dark-border bg-surface py-2 pl-9 pr-16 text-sm text-foreground outline-none transition-[border-color] placeholder:text-muted focus:border-primary/50"
      />
      {query ? (
        <button
          onClick={() => {
            setQuery('');
            setActiveIndex(0);
            inputRef.current?.focus();
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
      {open && (
        <div
          id="topbar-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-dark-border bg-dark-card py-2 shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
        >
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-medium text-foreground">No pages found</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                No pages match &ldquo;{query.trim()}&rdquo;. Try another search.
              </p>
            </div>
          ) : (
            <>
              <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {isSearching
                  ? `${results.length} result${results.length === 1 ? '' : 's'}`
                  : 'Jump to a page'}
              </p>
              {results.map((hit, i) => (
                <button
                  key={hit.item.href}
                  type="button"
                  id={`topbar-result-${hit.item.href}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  ref={(el) => {
                    if (el) resultRefs.current.set(hit.item.href, el);
                    else resultRefs.current.delete(hit.item.href);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => navigateTo(hit.item.href)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm outline-none',
                    i === activeIndex ? 'bg-dark-border/60 text-foreground' : 'text-muted',
                  )}
                >
                  <Search className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">
                    {hit.parentLabel && <span className="text-muted">{hit.parentLabel} / </span>}
                    <span className="font-medium">{hit.item.label}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
