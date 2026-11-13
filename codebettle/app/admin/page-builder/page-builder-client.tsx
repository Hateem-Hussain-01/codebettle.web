'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Pencil, AlertTriangle, LayoutTemplate, ExternalLink } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import toast from 'react-hot-toast';
import type { Page } from '@/lib/db/types';
import { useAdminUrl } from '@/components/admin/AdminBasePathContext';
import { MAX_PAGE_TITLE_LENGTH, normalizeSlug } from '@/lib/page-builder';

/**
 * Admin Page Builder — list of custom pages.
 * Create (title + URL slug), open the block editor, view the live page
 * (published only), delete (real DB delete, with confirmation).
 * Every control calls a real API (/api/admin/page-builder). When the
 * Page table has not been created yet (SQL not run), the list shows a
 * "run the SQL" state instead of an error — nothing else on the site
 * is affected.
 */
export default function PageBuilderClient() {
  const router = useRouter();
  const adminUrl = useAdminUrl();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Page | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setTableMissing(false);
    try {
      const res = await fetch('/api/admin/page-builder');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body.error ?? 'Could not load pages');
        return;
      }
      setPages(Array.isArray(body.pages) ? body.pages : []);
      setTableMissing(body.tableMissing === true);
    } catch {
      setLoadError('Could not load pages — check your connection and try again');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  const handleTitleChange = (value: string) => {
    setNewTitle(value);
    if (!slugTouched) setNewSlug(normalizeSlug(value));
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      toast.error('Give the page a title first');
      return;
    }
    const slug = normalizeSlug(newSlug || newTitle);
    if (!slug) {
      toast.error('Give the page a URL (lowercase letters, numbers and hyphens)');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/page-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), slug }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Could not create the page');
        return;
      }
      toast.success('Page created — add blocks below');
      router.push(adminUrl(`/page-builder/${body.page.id}`));
    } catch {
      toast.error('Could not create the page — please try again');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/page-builder/${deleteTarget.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Could not delete the page');
        return;
      }
      toast.success('Page deleted');
      setDeleteTarget(null);
      loadPages();
    } catch {
      toast.error('Could not delete the page — please try again');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-foreground">Page Builder</h1>
            <p className="text-muted text-sm mt-1">
              Build new pages from blocks — hero, text, image, stats, call to action — and publish them
              live at /pages/&lt;url&gt;. No code needed.
            </p>
          </div>
        </div>
      </FadeIn>

      {tableMissing && (
        <Card className="border-yellow-500/30 bg-yellow-500/5 p-5">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">Page Builder tables are not set up yet</p>
              <p className="text-muted text-sm mt-1">
                Run <code className="text-foreground">codebettle-page-builder-migration.sql</code> in the
                Supabase SQL Editor first — then pages can be created here.
              </p>
            </div>
          </div>
        </Card>
      )}

      {loadError && (
        <Card className="border-red-500/30 bg-red-500/5 p-5">
          <p className="text-sm text-red-400">{loadError}</p>
          <Button variant="secondary" className="mt-3" onClick={loadPages}>
            Try again
          </Button>
        </Card>
      )}

      {!tableMissing && !loadError && (
        <Card className="p-5">
          <h2 className="font-bold text-foreground mb-3">New page</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={newTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Page title (e.g. Summer Camp 2026)"
              maxLength={MAX_PAGE_TITLE_LENGTH}
              className="flex-1 bg-background border border-dark-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary/50"
            />
            <div className="flex items-center gap-0 flex-1">
              <span className="bg-dark-card border border-r-0 border-dark-border rounded-l-lg px-3 py-2 text-sm text-muted shrink-0">
                /pages/
              </span>
              <input
                value={newSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setNewSlug(e.target.value);
                }}
                placeholder="summer-camp-2026"
                className="flex-1 min-w-0 bg-background border border-dark-border rounded-r-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary/50"
              />
            </div>
            <Button onClick={handleCreate} loading={creating} disabled={loading}>
              <Plus className="w-4 h-4" /> Create page
            </Button>
          </div>
          <p className="text-muted text-xs mt-2">
            The URL uses lowercase letters, numbers and hyphens only. It is filled in from the title
            automatically — edit it if you want a different URL.
          </p>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        !tableMissing &&
        !loadError && (
          <div className="space-y-3">
            {pages.length === 0 && (
              <Card className="p-8 text-center">
                <LayoutTemplate className="w-10 h-10 text-muted mx-auto mb-3" />
                <p className="font-semibold text-foreground">No pages yet</p>
                <p className="text-muted text-sm mt-1">
                  Create your first page above — it stays a draft until you publish it.
                </p>
              </Card>
            )}
            {pages.map((page) => (
              <FadeIn key={page.id}>
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-foreground truncate">{page.title}</p>
                        <Badge variant={page.status === 'published' ? 'success' : 'muted'}>
                          {page.status === 'published' ? 'Published' : 'Draft'}
                        </Badge>
                      </div>
                      <p className="text-muted text-sm mt-1 truncate">
                        /pages/{page.slug} · {page.blocks.length} block{page.blocks.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {page.status === 'published' && (
                        <Link
                          href={`/pages/${page.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-primary-text hover:underline px-2 py-1"
                        >
                          <ExternalLink className="w-4 h-4" /> View live
                        </Link>
                      )}
                      <Link href={adminUrl(`/page-builder/${page.id}`)}>
                        <Button variant="secondary">
                          <Pencil className="w-4 h-4" /> Edit
                        </Button>
                      </Link>
                      <Button variant="danger" onClick={() => setDeleteTarget(page)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </FadeIn>
            ))}
          </div>
        )
      )}

      <Modal isOpen={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete page?">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Delete <span className="text-foreground font-semibold">{deleteTarget?.title}</span> (/pages/
            {deleteTarget?.slug})? The page and all its blocks are removed from the database. This
            cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" fullWidth onClick={handleDelete} loading={deleting}>
              <Trash2 className="w-4 h-4" /> Delete page
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
