'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogOut, Settings, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Shared avatar dropdown menu — used by the portal topbar
 * (PortalLayout) and the public navbar (Navbar) for logged-in users.
 *
 * The avatar button keeps the exact look PortalLayout had as a plain
 * link (w-8 h-8, rounded-full, border-2 border-primary/40, DiceBear
 * initials fallback); clicking it opens a small menu with the user's
 * name + email, Profile, Settings, and Logout. No design change:
 * dark-card / dark-border / text-muted / text-foreground tokens only.
 *
 * Controlled when `open` is passed (tests render it controlled-open);
 * uncontrolled by default (internal useState). The menu closes on
 * outside click, on Escape (focus returns to the avatar button), and
 * when a menu item is chosen. ArrowUp/ArrowDown move focus between
 * the three menu items.
 */

export interface UserMenuUser {
  name: string;
  email?: string;
  avatar?: string;
}

interface UserMenuProps {
  user: UserMenuUser;
  profileHref: string;
  settingsHref: string;
  onLogout: () => void | Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function UserMenu({ user, profileHref, settingsHref, onLogout, open, onOpenChange }: UserMenuProps) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? open : internalOpen;
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close on Escape (anywhere while open) and return focus to the button.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const avatarSrc = user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Account menu for ${user.name}`}
        className="block rounded-full cursor-pointer"
      >
        <img src={avatarSrc} alt={user.name} className="w-8 h-8 rounded-full object-cover border-2 border-primary/40 hover:border-primary transition-colors" />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label="Account menu"
            onKeyDown={handleMenuKeyDown}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-56 bg-dark-card border border-dark-border rounded-xl elev-3 z-50 overflow-hidden"
          >
            {/* Header: name + email only (no role). */}
            <div className="px-4 py-3 border-b border-dark-border">
              <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
              {user.email && <p className="text-xs text-muted truncate">{user.email}</p>}
            </div>
            <div className="py-1">
              <Link href={profileHref} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:bg-dark-border transition-colors">
                <User className="w-4 h-4" />
                Profile
              </Link>
              <Link href={settingsHref} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:bg-dark-border transition-colors">
                <Settings className="w-4 h-4" />
                Settings
              </Link>
              <div className="my-1 border-t border-dark-border" />
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); void onLogout(); }}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors w-full cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
