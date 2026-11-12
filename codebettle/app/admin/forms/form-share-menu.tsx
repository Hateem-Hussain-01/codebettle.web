'use client';
import { useState } from 'react';
import { Code2, Link2, Share2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { buildEmbedSnippet, buildFormShareUrl } from '@/lib/form-style';
import toast from 'react-hot-toast';

/** Copy text, with a legacy fallback when the Clipboard API is unavailable. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      return true;
    } catch {
      return false;
    }
  }
}

interface FormShareMenuProps {
  /** Form name — used as the share title and the embed iframe title. */
  name: string;
  slug: string;
  /** Icon-only button (list row) or a labelled button (builder top bar). */
  variant?: 'icon' | 'button';
}

/**
 * Share menu for a PUBLISHED form (GHL-style, Worker B). Rendered only
 * for published forms — the caller gates it on status. Three options:
 *
 * - Share Link: copies `{origin}/forms/{slug}` to the clipboard.
 * - Share: the Web Share API, with a copy-link fallback when the
 *   device/browser has no share sheet (a cancelled share stays silent).
 * - Embed Code: copies an iframe snippet for `?embed=1` (standalone
 *   form, no Navbar/Footer/hero — frameable by design, see proxy.ts).
 *
 * The menu is `position: fixed` from the button's bounding rect, so it
 * is never clipped by the list table's `overflow-x-auto` wrapper. A
 * transparent backdrop closes it on any outside click.
 */
export default function FormShareMenu({ name, slug, variant = 'icon' }: FormShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    // Anchor the menu to the clicked button (no ref needed — the
    // shared Button component does not forward one).
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      // Keep the 240px menu on screen: align to the button's left
      // edge unless that would overflow the viewport.
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)),
    });
    setOpen((o) => !o);
  };

  const closeMenu = () => setOpen(false);

  const publicUrl = () => buildFormShareUrl(window.location.origin, slug);

  const handleCopyLink = async () => {
    closeMenu();
    const ok = await copyText(publicUrl());
    if (ok) toast.success('Link copied to clipboard');
    else toast.error('Could not copy the link');
  };

  const handleShare = async () => {
    closeMenu();
    const url = publicUrl();
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: name, url });
        return;
      } catch (err) {
        // The user cancelled the share sheet — stay silent. Any other
        // failure falls through to the copy-link fallback below.
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    const ok = await copyText(url);
    if (ok) toast.success('Sharing is not available here — link copied instead');
    else toast.error('Could not share or copy the link');
  };

  const handleCopyEmbed = async () => {
    closeMenu();
    const snippet = buildEmbedSnippet(window.location.origin, slug, name);
    const ok = await copyText(snippet);
    if (ok) toast.success('Embed code copied to clipboard');
    else toast.error('Could not copy the embed code');
  };

  const items = [
    { label: 'Share Link', hint: 'Copy the public form URL', icon: Link2, onClick: () => void handleCopyLink() },
    { label: 'Share', hint: 'Send via your device share sheet', icon: Share2, onClick: () => void handleShare() },
    { label: 'Embed Code', hint: 'Copy an iframe snippet for your site', icon: Code2, onClick: () => void handleCopyEmbed() },
  ];

  return (
    <>
      {variant === 'button' ? (
        <Button variant="secondary" size="sm" onClick={openMenu} aria-haspopup="menu" aria-expanded={open}>
          <Share2 className="w-4 h-4" />Share
        </Button>
      ) : (
        <button
          type="button"
          onClick={openMenu}
          title="Share this form"
          aria-haspopup="menu"
          aria-expanded={open}
          className="text-muted hover:text-primary-text p-1 cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
        </button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); closeMenu(); }} />
          <div
            role="menu"
            className="fixed z-50 w-60 rounded-xl border border-dark-border bg-dark-card shadow-xl py-1"
            style={{ top: menuPos.top, left: menuPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={item.onClick}
                className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-dark-border/40 cursor-pointer"
              >
                <item.icon className="w-4 h-4 text-primary-text mt-0.5 shrink-0" />
                <span>
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted mt-0.5">{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
