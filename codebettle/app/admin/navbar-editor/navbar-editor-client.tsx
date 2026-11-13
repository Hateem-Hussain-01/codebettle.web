'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { NavItem } from '@/lib/db/types';
import { NAV_DESTINATION_OPTIONS } from '@/lib/management';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  PanelTop,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';

/**
 * Admin > Navbar Editor (PR #32) — nav items (label, destination,
 * order, enable/disable) and the navbar logo.
 *
 * - The navbar reads its items + logo from the DB (GET /api/nav); when
 *   the table is empty it falls back to the hardcoded items (with
 *   'Spotlight' for /success-stories), so the nav never breaks.
 * - "Load current nav" seeds the defaults into the table once, so an
 *   admin can edit them; a second seed is a no-op.
 * - "Change Logo" uploads a new logo (JPG/PNG/WebP, 2 MB max) to the
 *   public course-images bucket and saves its URL as the
 *   navbarLogoUrl setting — the navbar shows it with no deploy.
 */

interface ItemsResponse {
  items: NavItem[];
  tablesReady: boolean;
  fromDefaults?: boolean;
  error?: string;
}

const EMPTY_FORM = { label: '', href: '/courses', customHref: '', order: 0 };

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    return json.error ?? fallback;
  } catch {
    return fallback;
  }
}

export default function NavbarEditorClient() {
  const [items, setItems] = useState<NavItem[]>([]);
  const [tablesReady, setTablesReady] = useState(true);
  const [fromDefaults, setFromDefaults] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [useCustomHref, setUseCustomHref] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [itemsRes, navRes] = await Promise.all([
        fetch('/api/admin/navbar-editor/items'),
        fetch('/api/nav'),
      ]);
      const itemsJson = (await itemsRes.json()) as ItemsResponse;
      if (!itemsRes.ok) throw new Error(itemsJson.error ?? 'Could not load nav items');
      setItems(itemsJson.items ?? []);
      setTablesReady(itemsJson.tablesReady !== false);
      setFromDefaults(itemsJson.fromDefaults === true);
      if (navRes.ok) {
        const navJson = (await navRes.json()) as { logoUrl?: string };
        if (typeof navJson.logoUrl === 'string') setLogoUrl(navJson.logoUrl);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the navbar editor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
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

  const seedDefaults = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/navbar-editor/items/seed', { method: 'POST' });
      if (!res.ok) throw new Error(await readError(res, 'Could not load the current nav'));
      await load();
      flash('Current nav loaded — edit, reorder or disable the items below.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not load the current nav');
    } finally {
      setBusy(false);
    }
  };

  const saveItem = async () => {
    setBusy(true);
    try {
      const href = useCustomHref ? form.customHref.trim() : form.href;
      const payload = { label: form.label.trim(), href, order: Number(form.order) || 0 };
      const res = await fetch(editingId ? `/api/admin/navbar-editor/items/${editingId}` : '/api/admin/navbar-editor/items', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not save the nav item'));
      setForm(EMPTY_FORM);
      setUseCustomHref(false);
      setEditingId(null);
      setShowForm(false);
      await load();
      flash(editingId ? 'Nav item updated.' : 'Nav item added.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not save the nav item');
    } finally {
      setBusy(false);
    }
  };

  const toggleItem = async (item: NavItem) => {
    const res = await fetch(`/api/admin/navbar-editor/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !item.enabled }),
    });
    if (!res.ok) {
      fail(await readError(res, 'Could not update the nav item'));
      return;
    }
    await load();
  };

  const moveItem = async (item: NavItem, direction: 'up' | 'down') => {
    const sorted = [...items].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    const idx = sorted.findIndex((i) => i.id === item.id);
    const other = direction === 'up' ? sorted[idx - 1] : sorted[idx + 1];
    if (!other) return;
    const [r1, r2] = await Promise.all([
      fetch(`/api/admin/navbar-editor/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: other.order }),
      }),
      fetch(`/api/admin/navbar-editor/items/${other.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: item.order }),
      }),
    ]);
    if (!r1.ok || !r2.ok) {
      fail('Could not reorder the nav item');
      return;
    }
    await load();
  };

  const deleteItem = async (item: NavItem) => {
    if (!window.confirm(`Delete the “${item.label}” nav item?`)) return;
    const res = await fetch(`/api/admin/navbar-editor/items/${item.id}`, { method: 'DELETE' });
    if (!res.ok) {
      fail(await readError(res, 'Could not delete the nav item'));
      return;
    }
    await load();
    flash('Nav item deleted.');
  };

  const uploadLogo = async (file: File) => {
    setLogoBusy(true);
    try {
      const data = new FormData();
      data.append('logo', file);
      const res = await fetch('/api/admin/navbar-editor/logo', { method: 'POST', body: data });
      if (!res.ok) throw new Error(await readError(res, 'Logo upload failed'));
      const json = (await res.json()) as { url: string };
      setLogoUrl(json.url);
      flash('Logo changed — the navbar shows it now.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Logo upload failed');
    } finally {
      setLogoBusy(false);
    }
  };

  if (loading) {
    return <p className="text-muted">Loading the navbar editor…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <PanelTop className="w-6 h-6 text-primary-text" /> Navbar Editor
        </h1>
        <p className="text-muted text-sm mt-1">
          Edit the navbar labels, destinations and order, and change the logo. Changes show on the site with no deploy. When nothing is saved here, the navbar shows its current items (with “Spotlight” for Success Stories).
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
            The nav item table is not set up yet — run{' '}
            <code className="font-mono">codebettle-success-stories-mgmt-migration.sql</code> in the Supabase SQL Editor first.
          </span>
        </div>
      )}

      {/* Logo */}
      <section className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-foreground">Logo</h2>
        <div className="flex flex-wrap items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Current navbar logo" className="h-10 w-auto bg-dark rounded-lg px-2 py-1 border border-dark-border" />
          ) : (
            <span className="text-sm text-muted">No logo URL saved yet.</span>
          )}
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-border text-foreground text-sm font-semibold cursor-pointer hover:opacity-90">
            <Upload className="w-4 h-4" />
            Change Logo (JPG/PNG/WebP, max 2 MB)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadLogo(f);
              }}
            />
          </label>
          {logoBusy && <span className="text-xs text-muted">Uploading…</span>}
        </div>
        <p className="text-xs text-muted">The logo is shown at about 36px tall in the navbar. Upload a wide (horizontal) logo; it is stored in the public course-images bucket under brand/.</p>
      </section>

      {/* Nav items */}
      <section className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">Nav Items ({items.length})</h2>
          <div className="flex items-center gap-2">
            {fromDefaults && (
              <Button variant="secondary" size="sm" loading={busy} onClick={() => void seedDefaults()}>
                Load current nav for editing
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setForm(EMPTY_FORM);
                setUseCustomHref(false);
                setEditingId(null);
                setShowForm((s) => !s);
              }}
            >
              <Plus className="w-4 h-4" /> Add nav item
            </Button>
          </div>
        </div>

        {fromDefaults && (
          <p className="text-sm text-muted">
            No nav config is saved yet — the navbar is showing its current items. “Load current nav for editing” saves those items here so you can change them.
          </p>
        )}

        {showForm && (
          <div className="rounded-lg border border-dark-border bg-background p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Label *" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Spotlight" />
              <Input label="Order" type="number" min={0} value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground/80">
              Destination *
              <select
                value={useCustomHref ? '__custom' : form.href}
                onChange={(e) => {
                  if (e.target.value === '__custom') {
                    setUseCustomHref(true);
                  } else {
                    setUseCustomHref(false);
                    setForm({ ...form, href: e.target.value });
                  }
                }}
                className="w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground"
              >
                {NAV_DESTINATION_OPTIONS.map((opt) => (
                  <option key={opt.href} value={opt.href}>{opt.label} — {opt.href}</option>
                ))}
                <option value="__custom">Custom path / URL…</option>
              </select>
            </label>
            {useCustomHref && (
              <Input
                label="Custom destination"
                value={form.customHref}
                onChange={(e) => setForm({ ...form, customHref: e.target.value })}
                placeholder="/my-page or https://…"
              />
            )}
            <div className="flex gap-2">
              <Button variant="primary" size="sm" loading={busy} onClick={() => void saveItem()}>
                {editingId ? 'Save changes' : 'Add nav item'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            </div>
          </div>
        )}

        {items.length === 0 && !fromDefaults ? (
          <p className="text-sm text-muted">No nav items saved — the navbar is showing its fallback items.</p>
        ) : (
          <ul className="divide-y divide-dark-border">
            {items.map((item) => (
              <li key={item.id} className="py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{item.label}</p>
                  <p className="text-xs text-muted truncate">{item.href} · Order {item.order} · {item.enabled ? 'Shown in the navbar' : 'Hidden from the navbar'}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => void moveItem(item, 'up')} aria-label="Move up" className="p-1.5 text-muted hover:text-foreground"><ArrowUp className="w-4 h-4" /></button>
                  <button onClick={() => void moveItem(item, 'down')} aria-label="Move down" className="p-1.5 text-muted hover:text-foreground"><ArrowDown className="w-4 h-4" /></button>
                  <button
                    onClick={() => void toggleItem(item)}
                    aria-label={item.enabled ? 'Hide from navbar' : 'Show in navbar'}
                    title={item.enabled ? 'Hide from navbar' : 'Show in navbar'}
                    className="p-1.5 text-muted hover:text-foreground"
                  >
                    {item.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => {
                      const isCustom = !NAV_DESTINATION_OPTIONS.some((o) => o.href === item.href);
                      setForm({ label: item.label, href: isCustom ? '/courses' : item.href, customHref: isCustom ? item.href : '', order: item.order });
                      setUseCustomHref(isCustom);
                      setEditingId(item.id);
                      setShowForm(true);
                    }}
                    aria-label="Edit"
                    className="p-1.5 text-muted hover:text-foreground"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => void deleteItem(item)} aria-label="Delete" className="p-1.5 text-red-400 hover:text-red-300">
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
