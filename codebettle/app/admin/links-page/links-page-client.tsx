'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { Link } from '@/lib/db/types';
import { LINK_ICON_OPTIONS, LINKS_PAGE_URL } from '@/lib/links';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Eye,
  EyeOff,
  Link2,
  Pencil,
  Plus,
  Share2,
  Trash2,
} from 'lucide-react';

/**
 * Admin > Links Page — the public /links page editor (Linktree-style).
 *
 * - Link buttons (label, URL, icon, order, enable/disable) with
 *   up/down arrows: the admin's arrow order IS the public order.
 * - Contact details (tagline, phone, email, location) shown on the
 *   card — saved through /api/admin/links-page/settings.
 * - Copy link + Share for the page URL (the production URL, never a
 *   localhost/dev one). Share uses the Web Share API where the
 *   browser supports it, otherwise it copies the link.
 * - The /links page is NOT in the navbar, footer, sitemap or robots —
 *   it is reached only by this direct link, sent to clients.
 * - "Load default links" seeds the 6 default links once, so an admin
 *   can edit them; a second seed is a no-op.
 */

interface LinksResponse {
  links: Link[];
  tablesReady: boolean;
  error?: string;
}

interface DetailsResponse {
  settings: { linksTagline: string; linksPhone: string; linksEmail: string; linksLocation: string };
  error?: string;
}

const EMPTY_FORM = { label: '', url: '', icon: 'link', order: 0 };

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    return json.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable (old browser / non-secure context):
    // fall back to a temporary textarea + execCommand.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export default function LinksPageClient() {
  const [links, setLinks] = useState<Link[]>([]);
  const [tablesReady, setTablesReady] = useState(true);
  const [details, setDetails] = useState({ linksTagline: '', linksPhone: '', linksEmail: '', linksLocation: '' });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [linksRes, detailsRes] = await Promise.all([
        fetch('/api/admin/links-page/links'),
        fetch('/api/admin/links-page/settings'),
      ]);
      const linksJson = (await linksRes.json()) as LinksResponse;
      if (!linksRes.ok) throw new Error(linksJson.error ?? 'Could not load links');
      setLinks(linksJson.links ?? []);
      setTablesReady(linksJson.tablesReady !== false);
      if (detailsRes.ok) {
        const detailsJson = (await detailsRes.json()) as DetailsResponse;
        setDetails(detailsJson.settings);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the Links Page editor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    setError(null);
    window.setTimeout(() => setNotice(null), 4000);
  };
  const fail = (message: string) => {
    setError(message);
    setNotice(null);
  };

  const copyLink = async () => {
    const ok = await copyText(LINKS_PAGE_URL);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
      flash('Link copied — send it to your client.');
    } else {
      fail('Could not copy the link — copy it from the box above.');
    }
  };

  const shareLink = async () => {
    if (canShare) {
      try {
        await navigator.share({ title: 'CodeBettle', text: 'CodeBettle — courses, calls and contacts', url: LINKS_PAGE_URL });
        return;
      } catch (e) {
        // The user dismissed the share sheet (AbortError) — not an
        // error. Any other failure falls through to copy.
        if (e instanceof Error && e.name === 'AbortError') return;
      }
    }
    await copyLink();
  };

  const seedDefaults = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/links-page/links/seed', { method: 'POST' });
      if (!res.ok) throw new Error(await readError(res, 'Could not load the default links'));
      await load();
      flash('Default links loaded — edit, reorder or disable them below.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not load the default links');
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = async () => {
    setDetailsBusy(true);
    try {
      const res = await fetch('/api/admin/links-page/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not save the details'));
      flash('Contact details saved — the public page shows them now.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not save the details');
    } finally {
      setDetailsBusy(false);
    }
  };

  const saveLink = async () => {
    setBusy(true);
    try {
      const payload = { label: form.label.trim(), url: form.url.trim(), icon: form.icon, order: Number(form.order) || 0 };
      const res = await fetch(editingId ? `/api/admin/links-page/links/${editingId}` : '/api/admin/links-page/links', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not save the link'));
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      await load();
      flash(editingId ? 'Link updated.' : 'Link added.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not save the link');
    } finally {
      setBusy(false);
    }
  };

  const toggleLink = async (link: Link) => {
    const res = await fetch(`/api/admin/links-page/links/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !link.enabled }),
    });
    if (!res.ok) {
      fail(await readError(res, 'Could not update the link'));
      return;
    }
    await load();
  };

  const moveLink = async (link: Link, direction: 'up' | 'down') => {
    const sorted = [...links].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    const idx = sorted.findIndex((i) => i.id === link.id);
    const other = direction === 'up' ? sorted[idx - 1] : sorted[idx + 1];
    if (!other) return;
    const [r1, r2] = await Promise.all([
      fetch(`/api/admin/links-page/links/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: other.order }),
      }),
      fetch(`/api/admin/links-page/links/${other.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: link.order }),
      }),
    ]);
    if (!r1.ok || !r2.ok) {
      fail('Could not reorder the link');
      return;
    }
    await load();
  };

  const deleteLink = async (link: Link) => {
    if (!window.confirm(`Delete the “${link.label}” link?`)) return;
    const res = await fetch(`/api/admin/links-page/links/${link.id}`, { method: 'DELETE' });
    if (!res.ok) {
      fail(await readError(res, 'Could not delete the link'));
      return;
    }
    await load();
    flash('Link deleted.');
  };

  if (loading) {
    return <p className="text-muted">Loading the Links Page editor…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Link2 className="w-6 h-6 text-primary-text" /> Links Page
        </h1>
        <p className="text-muted text-sm mt-1">
          The public Links page for clients (Linktree-style). It is not in the navbar, footer or sitemap — clients reach it only through the link below, which you send them.
        </p>
      </div>

      {notice && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 text-green-300 text-sm px-4 py-3">{notice}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-4 py-3">{error}</div>
      )}
      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-4 py-3">{loadError}</div>
      )}
      {!tablesReady && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 text-sm px-4 py-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            The links table is not set up yet — run{' '}
            <code className="font-mono">codebettle-links-page-migration.sql</code> in the Supabase SQL Editor first.
          </span>
        </div>
      )}

      {/* Share the page */}
      <section className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-foreground">Share this page</h2>
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 min-w-0 truncate rounded-lg border border-dark-border bg-background px-4 py-2.5 text-sm text-foreground">{LINKS_PAGE_URL}</code>
          <Button variant="secondary" size="sm" onClick={() => void copyLink()}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied!' : 'Copy link'}
          </Button>
          <Button variant="primary" size="sm" onClick={() => void shareLink()}>
            <Share2 className="w-4 h-4" /> Share
          </Button>
        </div>
        <p className="text-xs text-muted">Send this link to a client (WhatsApp, email, anywhere). The page is public, but it is not linked from anywhere on the website.</p>
      </section>

      {/* Contact details */}
      <section className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-foreground">Contact details on the card</h2>
        <p className="text-sm text-muted">The phone and email show on ONE line (separated by a dot); the location shows on its own line below.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Tagline" value={details.linksTagline} onChange={(e) => setDetails({ ...details, linksTagline: e.target.value })} placeholder="Learn. Code. Success." />
          <Input label="Location" value={details.linksLocation} onChange={(e) => setDetails({ ...details, linksLocation: e.target.value })} placeholder="Lahore, Punjab, Pakistan" />
          <Input label="Phone" value={details.linksPhone} onChange={(e) => setDetails({ ...details, linksPhone: e.target.value })} placeholder="+92 305 5261893" />
          <Input label="Email" value={details.linksEmail} onChange={(e) => setDetails({ ...details, linksEmail: e.target.value })} placeholder="info@codebettle.com" />
        </div>
        <Button variant="primary" size="sm" loading={detailsBusy} onClick={() => void saveDetails()}>
          Save details
        </Button>
      </section>

      {/* Links */}
      <section className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">Links ({links.length})</h2>
          <div className="flex items-center gap-2">
            {links.length === 0 && tablesReady && (
              <Button variant="secondary" size="sm" loading={busy} onClick={() => void seedDefaults()}>
                Load default links
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setForm(EMPTY_FORM);
                setEditingId(null);
                setShowForm((s) => !s);
              }}
            >
              <Plus className="w-4 h-4" /> Add link
            </Button>
          </div>
        </div>

        {links.length === 0 && tablesReady && (
          <p className="text-sm text-muted">
            No links saved yet — the public page shows its empty state. “Load default links” adds the 6 standard links (Courses, Book a Call, Success Stories, Ambassador, WhatsApp, WhatsApp Community).
          </p>
        )}

        {showForm && (
          <div className="rounded-lg border border-dark-border bg-background p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Label *" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Explore Our Courses" />
              <Input label="Order" type="number" min={0} value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
            </div>
            <Input label="URL *" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="/courses or https://…" />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground/80">
              Icon
              <select
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                className="w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground"
              >
                {LINK_ICON_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" loading={busy} onClick={() => void saveLink()}>
                {editingId ? 'Save changes' : 'Add link'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            </div>
          </div>
        )}

        {links.length > 0 && (
          <ul className="divide-y divide-dark-border">
            {links.map((link) => (
              <li key={link.id} className="py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{link.label}</p>
                  <p className="text-xs text-muted truncate">{link.url} · Order {link.order} · {link.enabled ? 'Shown on the Links page' : 'Hidden from the Links page'}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => void moveLink(link, 'up')} aria-label="Move up" className="p-1.5 text-muted hover:text-foreground"><ArrowUp className="w-4 h-4" /></button>
                  <button onClick={() => void moveLink(link, 'down')} aria-label="Move down" className="p-1.5 text-muted hover:text-foreground"><ArrowDown className="w-4 h-4" /></button>
                  <button
                    onClick={() => void toggleLink(link)}
                    aria-label={link.enabled ? 'Hide from Links page' : 'Show on Links page'}
                    title={link.enabled ? 'Hide from Links page' : 'Show on Links page'}
                    className="p-1.5 text-muted hover:text-foreground"
                  >
                    {link.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => {
                      setForm({ label: link.label, url: link.url, icon: link.icon, order: link.order });
                      setEditingId(link.id);
                      setShowForm(true);
                    }}
                    aria-label="Edit"
                    className="p-1.5 text-muted hover:text-foreground"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => void deleteLink(link)} aria-label="Delete" className="p-1.5 text-red-400 hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
