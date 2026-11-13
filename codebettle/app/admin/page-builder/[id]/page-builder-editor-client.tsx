'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  GripVertical,
  ImagePlus,
  LayoutTemplate,
  MoveDiagonal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import Spinner from '@/components/ui/Spinner';
import RichTextEditor from '@/components/ui/RichTextEditor';
import { PageBlocks } from '@/components/page-builder/PageBlocks';
import { useAdminUrl } from '@/components/admin/AdminBasePathContext';
import toast from 'react-hot-toast';
import type { Page } from '@/lib/db/types';
import {
  createBlock,
  MAX_BLOCK_HEIGHT,
  MAX_BLOCK_WIDTH,
  MAX_STAT_ITEMS,
  MIN_BLOCK_HEIGHT,
  MIN_BLOCK_WIDTH,
  normalizeSlug,
  PAGE_BLOCK_LABELS,
  PAGE_BLOCK_TYPES,
  validateSlug,
  type CtaBlockContent,
  type HeroBlockContent,
  type ImageBlockContent,
  type PageBlock,
  type PageBlockContent,
  type PageBlockType,
  type StatsBlockContent,
  type TextBlockContent,
} from '@/lib/page-builder';

const INPUT_CLASS =
  'w-full bg-background border border-dark-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary/50';
const LABEL_CLASS = 'block text-xs font-semibold text-muted mb-1';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

interface EditorProps {
  pageId: string;
}

/**
 * Admin Page Builder editor — one page's blocks.
 *
 * - Add / remove blocks (hero, text, image, stats, call to action).
 * - Reorder: drag the grip handle, or the up/down arrows.
 * - Resize: drag the corner handle (native pointer events — no
 *   library), or the width/height number inputs. Width is a percent
 *   of the page (25–100); height is a min-height in px, empty = auto.
 * - Preview: renders the SAME shared component as the public page, so
 *   what you see is what goes live — from the current (unsaved) blocks.
 * - Publish / Unpublish: a published page is live at /pages/<slug>;
 *   a draft returns 404 publicly.
 * The editor lives under /admin/*, so its code is route-split out of
 * the public bundle — the public page ships no editor JS at all.
 */
export default function PageBuilderEditorClient({ pageId }: EditorProps) {
  const adminUrl = useAdminUrl();
  const [page, setPage] = useState<Page | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{
    blockId: string;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    containerWidth: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{ blockId: string; field: 'imageUrl' } | null>(null);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setTableMissing(false);
    try {
      const res = await fetch(`/api/admin/page-builder/${pageId}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.tableMissing === true) {
          setTableMissing(true);
          return;
        }
        setLoadError(body.error ?? 'Could not load the page');
        return;
      }
      const p = body.page as Page;
      setPage(p);
      setTitle(p.title);
      setSlug(p.slug);
      setBlocks(Array.isArray(p.blocks) ? p.blocks : []);
      setDirty(false);
    } catch {
      setLoadError('Could not load the page — check your connection and try again');
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // Warn before leaving with unsaved block edits (same guard as the
  // success-story form).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const updateBlockContent = (blockId: string, content: PageBlockContent) => {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, content } : b)));
    setDirty(true);
  };

  const updateBlockLayout = (blockId: string, layout: Partial<PageBlock['layout']>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, layout: { ...b.layout, ...layout } } : b)),
    );
    setDirty(true);
  };

  const addBlock = (type: PageBlockType) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setBlocks((prev) => [...prev, createBlock(type, id)]);
    setDirty(true);
    setPreview(false);
  };

  const removeBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    setDirty(true);
  };

  const moveBlock = (blockId: string, dir: -1 | 1) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === blockId);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return next;
    });
    setDirty(true);
  };

  // --- Drag to reorder (native HTML5 drag, no library) -------------------
  const onReorderDragStart = (e: React.DragEvent, blockId: string) => {
    setDragId(blockId);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', blockId);
    } catch {
      // Some browsers restrict setData — the dragId state is enough.
    }
  };

  const onReorderDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const dragged = dragId;
    setDragId(null);
    setDropId(null);
    if (!dragged || dragged === targetId) return;
    setBlocks((prev) => {
      const from = prev.findIndex((b) => b.id === dragged);
      const to = prev.findIndex((b) => b.id === targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDirty(true);
  };

  // --- Drag to resize (native pointer events, no library) ----------------
  // Horizontal drag = width (% of the page), vertical drag = height (px).
  // The number inputs next to the handle are the precise fallback.
  const onResizePointerDown = (e: React.PointerEvent, block: PageBlock) => {
    e.preventDefault();
    const container = listRef.current;
    const card = (e.currentTarget as HTMLElement).closest('[data-block-card]') as HTMLElement | null;
    resizeRef.current = {
      blockId: block.id,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: block.layout.width,
      startHeight: block.layout.height ?? card?.offsetHeight ?? 200,
      containerWidth: container?.clientWidth ?? 800,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onResizePointerMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const dxPct = ((e.clientX - r.startX) / r.containerWidth) * 100;
    const newWidth = clamp(Math.round((r.startWidth + dxPct) / 5) * 5, MIN_BLOCK_WIDTH, MAX_BLOCK_WIDTH);
    const newHeight = clamp(Math.round(r.startHeight + (e.clientY - r.startY)), MIN_BLOCK_HEIGHT, MAX_BLOCK_HEIGHT);
    setBlocks((prev) =>
      prev.map((b) => (b.id === r.blockId ? { ...b, layout: { width: newWidth, height: newHeight } } : b)),
    );
    setDirty(true);
  };

  const onResizePointerUp = () => {
    resizeRef.current = null;
  };

  // --- Image upload (hero / image blocks) --------------------------------
  const requestImageUpload = (blockId: string) => {
    uploadTargetRef.current = { blockId, field: 'imageUrl' };
    fileInputRef.current?.click();
  };

  const handleImageFile = async (file: File) => {
    const target = uploadTargetRef.current;
    if (!target) return;
    setUploadingBlockId(target.blockId);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('pageId', pageId);
      const res = await fetch('/api/admin/page-builder/upload', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Could not upload the image');
        return;
      }
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== target.blockId) return b;
          const content = { ...(b.content as unknown as Record<string, unknown>), imageUrl: body.url as string };
          return { ...b, content: content as PageBlockContent };
        }),
      );
      setDirty(true);
      toast.success('Image uploaded');
    } catch {
      toast.error('Could not upload the image — please try again');
    } finally {
      setUploadingBlockId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- Save / publish ------------------------------------------------------
  const save = async (statusOverride?: 'draft' | 'published') => {
    if (!page) return;
    if (!title.trim()) {
      toast.error('Give the page a title first');
      return;
    }
    const nextSlug = normalizeSlug(slug);
    const slugError = validateSlug(nextSlug);
    if (slugError) {
      toast.error(slugError);
      return;
    }
    const status = statusOverride ?? page.status;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/page-builder/${pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), slug: nextSlug, status, blocks }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Could not save the page');
        return;
      }
      const p = body.page as Page;
      setPage(p);
      setTitle(p.title);
      setSlug(p.slug);
      setBlocks(Array.isArray(p.blocks) ? p.blocks : []);
      setDirty(false);
      toast.success(status === 'published' ? 'Page published — live now' : 'Page saved as draft');
    } catch {
      toast.error('Could not save the page — please try again');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (tableMissing) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/5 p-5">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground">Page Builder tables are not set up yet</p>
            <p className="text-muted text-sm mt-1">
              Run <code className="text-foreground">codebettle-page-builder-migration.sql</code> in the
              Supabase SQL Editor first — then this page can be edited here.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (loadError || !page) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 p-5">
        <p className="text-sm text-red-400">{loadError ?? 'Page not found'}</p>
        <div className="flex gap-3 mt-3">
          <Button variant="secondary" onClick={loadPage}>
            Try again
          </Button>
          <Link href={adminUrl('/page-builder')}>
            <Button variant="secondary">Back to pages</Button>
          </Link>
        </div>
      </Card>
    );
  }

  const isPublished = page.status === 'published';

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImageFile(file);
        }}
      />
      <FadeIn>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href={adminUrl('/page-builder')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Pages
          </Link>
          <Badge variant={isPublished ? 'success' : 'muted'}>{isPublished ? 'Published' : 'Draft'}</Badge>
          {dirty && <Badge variant="warning">Unsaved changes</Badge>}
        </div>
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 mt-3">
          <div className="flex-1 min-w-0 space-y-3">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              placeholder="Page title"
              className="w-full bg-transparent border-0 border-b border-dark-border focus:border-primary/50 focus:outline-none text-2xl font-black text-foreground py-1 placeholder:text-muted"
            />
            <div className="flex items-center gap-0 max-w-lg">
              <span className="bg-dark-card border border-r-0 border-dark-border rounded-l-lg px-3 py-2 text-sm text-muted shrink-0">
                /pages/
              </span>
              <input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setDirty(true);
                }}
                placeholder="page-url"
                className="flex-1 min-w-0 bg-background border border-dark-border rounded-r-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button
              variant="secondary"
              onClick={() => setPreview((p) => !p)}
            >
              {preview ? <Pencil className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {preview ? 'Back to editing' : 'Preview'}
            </Button>
            {isPublished && (
              <Link href={`/pages/${slug}`} target="_blank" rel="noreferrer">
                <Button variant="secondary">
                  <ExternalLink className="w-4 h-4" /> View live
                </Button>
              </Link>
            )}
            <Button
              variant={isPublished ? 'secondary' : 'primary'}
              onClick={() => void save(isPublished ? 'draft' : 'published')}
              loading={saving}
            >
              {isPublished ? 'Unpublish' : 'Publish'}
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              Save
            </Button>
          </div>
        </div>
      </FadeIn>

      {preview ? (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="text-sm text-muted">
              <span className="font-semibold text-foreground">Preview</span> — how the page will look
              when published{isPublished ? ' (live now)' : ' (still a draft — not public yet)'}. Unsaved
              edits are included.
            </p>
            <Button variant="secondary" onClick={() => setPreview(false)}>
              <Pencil className="w-4 h-4" /> Back to editing
            </Button>
          </div>
          <div className="border border-dark-border rounded-2xl bg-background px-4 sm:px-6 py-4 max-w-7xl mx-auto">
            <PageBlocks blocks={blocks} />
            {blocks.length === 0 && (
              <p className="text-muted text-center py-20">This page has no blocks yet — add one below.</p>
            )}
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <h2 className="font-bold text-foreground mb-1">Add a block</h2>
            <p className="text-muted text-sm mb-3">
              Blocks stack top to bottom on the page. Drag the grip to reorder, drag the corner handle
              to resize a block, or use the width / height numbers.
            </p>
            <div className="flex flex-wrap gap-2">
              {PAGE_BLOCK_TYPES.map((type) => (
                <Button key={type} variant="secondary" onClick={() => addBlock(type)}>
                  <Plus className="w-4 h-4" /> {PAGE_BLOCK_LABELS[type]}
                </Button>
              ))}
            </div>
          </Card>

          <div ref={listRef} className="space-y-4">
            {blocks.length === 0 && (
              <Card className="p-8 text-center">
                <LayoutTemplate className="w-10 h-10 text-muted mx-auto mb-3" />
                <p className="font-semibold text-foreground">No blocks yet</p>
                <p className="text-muted text-sm mt-1">Add a block above to start building this page.</p>
              </Card>
            )}
            {blocks.map((block, index) => (
              <BlockCard
                key={block.id}
                block={block}
                index={index}
                total={blocks.length}
                isDropTarget={dropId === block.id}
                uploading={uploadingBlockId === block.id}
                onContentChange={(content) => updateBlockContent(block.id, content)}
                onLayoutChange={(layout) => updateBlockLayout(block.id, layout)}
                onRemove={() => removeBlock(block.id)}
                onMove={(dir) => moveBlock(block.id, dir)}
                onReorderDragStart={(e) => onReorderDragStart(e, block.id)}
                onReorderDragOver={(e) => {
                  e.preventDefault();
                  setDropId(block.id);
                }}
                onReorderDrop={(e) => onReorderDrop(e, block.id)}
                onReorderDragEnd={() => {
                  setDragId(null);
                  setDropId(null);
                }}
                onResizePointerDown={(e) => onResizePointerDown(e, block)}
                onResizePointerMove={onResizePointerMove}
                onResizePointerUp={onResizePointerUp}
                onRequestImageUpload={() => requestImageUpload(block.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block card + per-type field editors.
// ---------------------------------------------------------------------------

interface BlockCardProps {
  block: PageBlock;
  index: number;
  total: number;
  isDropTarget: boolean;
  uploading: boolean;
  onContentChange: (content: PageBlockContent) => void;
  onLayoutChange: (layout: Partial<PageBlock['layout']>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onReorderDragStart: (e: React.DragEvent) => void;
  onReorderDragOver: (e: React.DragEvent) => void;
  onReorderDrop: (e: React.DragEvent) => void;
  onReorderDragEnd: () => void;
  onResizePointerDown: (e: React.PointerEvent) => void;
  onResizePointerMove: (e: React.PointerEvent) => void;
  onResizePointerUp: () => void;
  onRequestImageUpload: () => void;
}

function BlockCard({
  block,
  index,
  total,
  isDropTarget,
  uploading,
  onContentChange,
  onLayoutChange,
  onRemove,
  onMove,
  onReorderDragStart,
  onReorderDragOver,
  onReorderDrop,
  onReorderDragEnd,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onRequestImageUpload,
}: BlockCardProps) {
  // The card itself shows the block's width / height live, so the admin
  // sees the layout while editing (width % of the page, min-height px).
  const cardStyle: React.CSSProperties = {
    width: `${block.layout.width}%`,
    maxWidth: '100%',
    minHeight: block.layout.height,
  };
  return (
    <div
      data-block-card
      className="relative"
      onDragOver={onReorderDragOver}
      onDrop={onReorderDrop}
    >
      <Card
        className={`relative p-5 ${isDropTarget ? 'ring-2 ring-primary/60' : ''}`}
        style={cardStyle}
      >
        <div className="flex items-center gap-2 mb-4">
          <span
            draggable
            onDragStart={onReorderDragStart}
            onDragEnd={onReorderDragEnd}
            title="Drag to reorder"
            className="cursor-grab active:cursor-grabbing text-muted hover:text-foreground p-1 rounded"
          >
            <GripVertical className="w-5 h-5" />
          </span>
          <span className="font-bold text-foreground text-sm">
            {index + 1}. {PAGE_BLOCK_LABELS[block.type]}
          </span>
          <span className="text-muted text-xs">
            {block.layout.width}% wide{block.layout.height ? ` · ${block.layout.height}px tall` : ' · auto height'}
          </span>
          <span className="flex-1" />
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            title="Move up"
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-dark-border disabled:opacity-30 cursor-pointer"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            title="Move down"
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-dark-border disabled:opacity-30 cursor-pointer"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            onClick={onRemove}
            title="Remove block"
            className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <BlockFields
          block={block}
          uploading={uploading}
          onContentChange={onContentChange}
          onRequestImageUpload={onRequestImageUpload}
        />

        {/* Size controls: number inputs (precise) + drag handle (quick). */}
        <div className="flex flex-wrap items-end gap-3 mt-4 pt-4 border-t border-dark-border">
          <label className="text-xs text-muted">
            Width (%)
            <input
              type="number"
              min={MIN_BLOCK_WIDTH}
              max={MAX_BLOCK_WIDTH}
              step={5}
              value={block.layout.width}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) {
                  onLayoutChange({ width: clamp(Math.round(n), MIN_BLOCK_WIDTH, MAX_BLOCK_WIDTH) });
                }
              }}
              className="block mt-1 w-24 bg-background border border-dark-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </label>
          <label className="text-xs text-muted">
            Height (px, empty = auto)
            <span className="flex gap-2 mt-1">
              <input
                type="number"
                min={MIN_BLOCK_HEIGHT}
                max={MAX_BLOCK_HEIGHT}
                step={10}
                value={block.layout.height ?? ''}
                placeholder="Auto"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    onLayoutChange({ height: undefined });
                    return;
                  }
                  const n = Number(raw);
                  if (Number.isFinite(n)) {
                    onLayoutChange({ height: clamp(Math.round(n), MIN_BLOCK_HEIGHT, MAX_BLOCK_HEIGHT) });
                  }
                }}
                className="w-24 bg-background border border-dark-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
              {block.layout.height !== undefined && (
                <button
                  onClick={() => onLayoutChange({ height: undefined })}
                  className="px-2 py-1.5 text-xs rounded-lg border border-dark-border text-muted hover:text-foreground cursor-pointer"
                >
                  Auto
                </button>
              )}
            </span>
          </label>
          <span className="text-xs text-muted pb-2">
            Tip: drag the corner handle to resize, or type exact numbers here.
          </span>
        </div>

        {/* Drag-to-resize corner handle (native pointer events). */}
        <div
          role="button"
          aria-label="Drag to resize this block (width and height)"
          title="Drag to resize — sideways for width, up/down for height"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          className="absolute bottom-1 right-1 p-1.5 rounded-md text-muted hover:text-primary-text cursor-nwse-resize touch-none select-none"
        >
          <MoveDiagonal className="w-4 h-4" />
        </div>
      </Card>
    </div>
  );
}

interface BlockFieldsProps {
  block: PageBlock;
  uploading: boolean;
  onContentChange: (content: PageBlockContent) => void;
  onRequestImageUpload: () => void;
}

function BlockFields({ block, uploading, onContentChange, onRequestImageUpload }: BlockFieldsProps) {
  switch (block.type) {
    case 'hero': {
      const c = block.content as HeroBlockContent;
      const set = (patch: Partial<HeroBlockContent>) => onContentChange({ ...c, ...patch });
      return (
        <div className="space-y-3">
          <div>
            <label className={LABEL_CLASS}>Heading</label>
            <input value={c.heading} onChange={(e) => set({ heading: e.target.value })} placeholder="Big headline" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Subtext</label>
            <textarea value={c.subtext} onChange={(e) => set({ subtext: e.target.value })} placeholder="One or two lines under the headline" rows={2} className={INPUT_CLASS} />
          </div>
          <ImageUrlField
            label="Image (optional)"
            imageUrl={c.imageUrl}
            uploading={uploading}
            onChange={(imageUrl) => set({ imageUrl })}
            onRequestUpload={onRequestImageUpload}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Button label (optional)</label>
              <input value={c.ctaLabel} onChange={(e) => set({ ctaLabel: e.target.value })} placeholder="Explore courses" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Button link (optional)</label>
              <input value={c.ctaLink} onChange={(e) => set({ ctaLink: e.target.value })} placeholder="/courses" className={INPUT_CLASS} />
            </div>
          </div>
        </div>
      );
    }
    case 'text': {
      const c = block.content as TextBlockContent;
      return (
        <RichTextEditor
          key={block.id}
          label="Text"
          initialHtml={c.html}
          onChange={(html) => onContentChange({ html })}
          footerNote={null}
        />
      );
    }
    case 'image': {
      const c = block.content as ImageBlockContent;
      const set = (patch: Partial<ImageBlockContent>) => onContentChange({ ...c, ...patch });
      return (
        <div className="space-y-3">
          <ImageUrlField
            label="Image"
            imageUrl={c.imageUrl}
            uploading={uploading}
            onChange={(imageUrl) => set({ imageUrl })}
            onRequestUpload={onRequestImageUpload}
          />
          <div>
            <label className={LABEL_CLASS}>Alt text (for accessibility)</label>
            <input value={c.alt} onChange={(e) => set({ alt: e.target.value })} placeholder="Describe the image" className={INPUT_CLASS} />
          </div>
        </div>
      );
    }
    case 'stats': {
      const c = block.content as StatsBlockContent;
      const setItems = (items: StatsBlockContent['items']) => onContentChange({ items });
      return (
        <div className="space-y-3">
          {c.items.map((item, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                value={item.value}
                onChange={(e) => {
                  const items = c.items.map((it, j) => (j === i ? { ...it, value: e.target.value } : it));
                  setItems(items);
                }}
                placeholder="1500+"
                className={INPUT_CLASS}
              />
              <input
                value={item.label}
                onChange={(e) => {
                  const items = c.items.map((it, j) => (j === i ? { ...it, label: e.target.value } : it));
                  setItems(items);
                }}
                placeholder="Active Students"
                className={INPUT_CLASS}
              />
              <button
                onClick={() => setItems(c.items.filter((_, j) => j !== i))}
                disabled={c.items.length <= 1}
                title="Remove stat"
                className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-30 cursor-pointer shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {c.items.length < MAX_STAT_ITEMS && (
            <Button variant="secondary" onClick={() => setItems([...c.items, { value: '', label: '' }])}>
              <Plus className="w-4 h-4" /> Add stat
            </Button>
          )}
        </div>
      );
    }
    case 'cta': {
      const c = block.content as CtaBlockContent;
      const set = (patch: Partial<CtaBlockContent>) => onContentChange({ ...c, ...patch });
      return (
        <div className="space-y-3">
          <div>
            <label className={LABEL_CLASS}>Heading</label>
            <input value={c.heading} onChange={(e) => set({ heading: e.target.value })} placeholder="Ready to start?" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Text</label>
            <textarea value={c.text} onChange={(e) => set({ text: e.target.value })} placeholder="One or two lines" rows={2} className={INPUT_CLASS} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Button label</label>
              <input value={c.buttonLabel} onChange={(e) => set({ buttonLabel: e.target.value })} placeholder="Enroll now" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Button link</label>
              <input value={c.buttonLink} onChange={(e) => set({ buttonLink: e.target.value })} placeholder="/courses" className={INPUT_CLASS} />
            </div>
          </div>
        </div>
      );
    }
  }
}

function ImageUrlField({
  label,
  imageUrl,
  uploading,
  onChange,
  onRequestUpload,
}: {
  label: string;
  imageUrl: string;
  uploading: boolean;
  onChange: (url: string) => void;
  onRequestUpload: () => void;
}) {
  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      <div className="flex gap-2">
        <input
          value={imageUrl}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… or upload an image"
          className={INPUT_CLASS}
        />
        <Button variant="secondary" onClick={onRequestUpload} loading={uploading}>
          <ImagePlus className="w-4 h-4" /> Upload
        </Button>
      </div>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="mt-2 max-h-48 w-auto rounded-lg border border-dark-border" />
      )}
    </div>
  );
}
