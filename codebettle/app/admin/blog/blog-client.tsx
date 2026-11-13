'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import {
  Plus, Trash2, Eye, EyeOff, Pencil, FileText, X,
  Bold, Italic, Underline, Heading2, Heading3, List, ListOrdered, Link2, Eraser,
  Upload, Loader2,
} from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import { sanitizeBlogHtml } from '@/lib/sanitize';
import toast from 'react-hot-toast';
import type { BlogPost } from '@/lib/db/types';

type Post = BlogPost;

interface BlogClientProps {
  initialPosts: BlogPost[];
}

const EMPTY_FORM = {
  title: '', slug: '', excerpt: '', content: '', category: '', thumbnail: '',
  authorName: '', readTime: '5 min read', tags: '', isPublished: true, pdfUrl: '',
};

function slugify(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function plainTextOf(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/**
 * Lightweight dependency-free rich-text editor (Phase 3).
 * A contentEditable area with a small execCommand toolbar; the HTML it
 * produces is stored verbatim in the post's `content` field. No editor
 * library is installed (checked package.json) and none is added.
 *
 * The editor is UNCONTROLLED: the DOM is the source of truth while
 * typing. React must NOT re-apply `initialHtml` on every keystroke —
 * the old code did exactly that (dangerouslySetInnerHTML driven by
 * parent state), which reset the DOM and dropped the caret to the
 * start on every input, so text typed backwards and backspace did
 * nothing. Instead the content is written into the DOM only when it
 * changes from OUTSIDE the editor (opening another post, form reset);
 * the sync effect below tells editor-driven changes apart from
 * outside ones via `lastEmittedRef`.
 */
function RichTextEditor({
  initialHtml, onChange, disabled,
}: {
  initialHtml: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Last HTML this editor emitted (sanitized). Compared against the
  // sanitized `initialHtml` prop so the sync effect below can tell an
  // editor-driven change (leave the DOM alone — the caret stays put)
  // from an outside change (open another post, reset the form —
  // rewrite the DOM). Both sides are sanitized, so the comparison is
  // apples-to-apples even if the sanitizer normalizes the markup.
  const lastEmittedRef = useRef<string | null>(null);

  // Emit the editor's current HTML: record it (sanitized) first so the
  // sync effect recognises this change as editor-driven, then notify
  // the parent. Every path that mutates the DOM goes through here.
  const emit = () => {
    if (!ref.current) return;
    lastEmittedRef.current = sanitizeBlogHtml(ref.current.innerHTML);
    onChange(ref.current.innerHTML);
  };

  // Sync content ONLY when it changed from outside the editor. On
  // mount this writes the initial HTML into the (otherwise empty) div;
  // afterwards it fires when the parent passes genuinely new HTML.
  // When the change came from this editor itself, the DOM already
  // holds it — doing nothing here is what keeps the caret in place
  // while typing (and makes backspace work).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = sanitizeBlogHtml(initialHtml);
    if (lastEmittedRef.current !== next) {
      el.innerHTML = next;
      lastEmittedRef.current = next;
    }
  }, [initialHtml]);

  const run = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    emit();
  };

  const addLink = () => {
    const url = window.prompt('Link URL (https://…)');
    if (!url) return;
    run('createLink', url);
  };

  const tools: { label: string; title: string; action: () => void }[] = [
    { label: 'B', title: 'Bold', action: () => run('bold') },
    { label: 'I', title: 'Italic', action: () => run('italic') },
    { label: 'U', title: 'Underline', action: () => run('underline') },
    { label: 'H2', title: 'Heading 2', action: () => run('formatBlock', 'h2') },
    { label: 'H3', title: 'Heading 3', action: () => run('formatBlock', 'h3') },
    { label: '• List', title: 'Bullet list', action: () => run('insertUnorderedList') },
    { label: '1. List', title: 'Numbered list', action: () => run('insertOrderedList') },
    { label: 'Link', title: 'Insert link', action: addLink },
    { label: 'Clear', title: 'Clear formatting', action: () => run('removeFormat') },
  ];
  const icons = [Bold, Italic, Underline, Heading2, Heading3, List, ListOrdered, Link2, Eraser];

  return (
    <div>
      <span className="text-sm font-medium text-foreground/80 block mb-1.5">Content (rich text)</span>
      <div className="flex flex-wrap gap-1 mb-1 p-1 bg-dark-border/30 border border-dark-border rounded-lg">
        {tools.map((tool, i) => {
          const Icon = icons[i];
          return (
            <button
              key={tool.title}
              type="button"
              title={tool.title}
              aria-label={tool.title}
              disabled={disabled}
              onMouseDown={e => e.preventDefault()}
              onClick={tool.action}
              className="flex items-center gap-1 px-2 py-1 text-xs text-foreground/80 hover:text-foreground hover:bg-dark-border rounded cursor-pointer disabled:opacity-50"
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tool.label}</span>
            </button>
          );
        })}
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        className="min-h-[180px] w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary-text [&_a]:underline"
      />
      <p className="text-xs text-muted mt-1">Formatting is saved as HTML. Leave the text empty to publish a PDF-only article.</p>
    </div>
  );
}

export default function BlogClient({ initialPosts }: BlogClientProps) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [isOpen, setIsOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setEditingPost(null);
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setIsOpen(true);
  };

  const openEdit = (post: Post) => {
    setEditingPost(post);
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      category: post.category,
      thumbnail: post.thumbnail,
      authorName: post.authorName,
      readTime: post.readTime,
      tags: post.tags.join(', '),
      isPublished: post.isPublished,
      pdfUrl: post.pdfUrl ?? '',
    });
    setSlugTouched(true);
    setIsOpen(true);
  };

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  /** POST the chosen file to /api/admin/blog/upload and keep its URL. */
  const uploadPdf = async (file: File) => {
    if (file.type !== 'application/pdf') { toast.error('Only PDF files are allowed'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('PDF must be 10 MB or smaller'); return; }
    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await fetch('/api/admin/blog/upload', { method: 'POST', body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'PDF upload failed');
        return;
      }
      set('pdfUrl', body.url as string);
      toast.success('PDF uploaded');
    } catch {
      toast.error('PDF upload failed — check your connection and try again');
    } finally {
      setUploading(false);
    }
  };

  const savePost = async () => {
    if (!form.title.trim()) { toast.error('Title required'); return; }
    if (!form.slug.trim()) { toast.error('Slug required'); return; }
    if (!form.excerpt.trim()) { toast.error('Excerpt required'); return; }
    if (!form.category.trim()) { toast.error('Category required'); return; }
    if (!form.thumbnail.trim()) { toast.error('Thumbnail URL required'); return; }
    if (!form.readTime.trim()) { toast.error('Read time required'); return; }
    // A post may have a rich-text body, a PDF, or both. Empty content is
    // allowed when a PDF is attached (the API enforces content-or-PDF).
    const content = form.content;
    if (!plainTextOf(content) && !form.pdfUrl) {
      toast.error('Add article content or upload a PDF');
      return;
    }

    const payload: Record<string, unknown> = {
      slug: form.slug.trim(),
      title: form.title.trim(),
      excerpt: form.excerpt.trim(),
      content,
      thumbnail: form.thumbnail.trim(),
      category: form.category.trim(),
      readTime: form.readTime.trim(),
      isPublished: form.isPublished,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    };
    if (form.authorName.trim()) payload.authorName = form.authorName.trim();
    if (form.pdfUrl) payload.pdfUrl = form.pdfUrl;
    else if (editingPost) payload.pdfUrl = null;

    setSaving(true);
    try {
      const res = await fetch(
        editingPost ? `/api/admin/blog/${editingPost.id}` : '/api/admin/blog',
        {
          method: editingPost ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'Could not save the article');
        return;
      }
      const saved = body.post as Post;
      setPosts(ps => editingPost ? ps.map(p => (p.id === saved.id ? saved : p)) : [saved, ...ps]);
      toast.success(editingPost ? 'Article updated' : 'Article published!');
      setIsOpen(false);
      setEditingPost(null);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch {
      toast.error('Could not save the article — check your connection and try again');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (post: Post) => {
    setBusyId(post.id);
    try {
      const res = await fetch(`/api/admin/blog/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !post.isPublished }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'Could not update the article');
        return;
      }
      const saved = body.post as Post;
      setPosts(ps => ps.map(p => (p.id === saved.id ? saved : p)));
      toast.success(saved.isPublished ? 'Article published' : 'Article moved to drafts');
      router.refresh();
    } catch {
      toast.error('Could not update the article — check your connection and try again');
    } finally {
      setBusyId(null);
    }
  };

  const deletePost = async (post: Post) => {
    if (!window.confirm(`Delete "${post.title}"? This also removes its stored PDF.`)) return;
    setBusyId(post.id);
    try {
      const res = await fetch(`/api/admin/blog/${post.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'Could not delete the article');
        return;
      }
      setPosts(ps => ps.filter(p => p.id !== post.id));
      toast.success('Post deleted');
      router.refresh();
    } catch {
      toast.error('Could not delete the article — check your connection and try again');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Blog / Articles</h1>
          <p className="text-muted text-sm mt-1">{posts.length} article{posts.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" />New Article</Button>
      </FadeIn>

      <FadeIn delay={0.08} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border bg-dark-border/20">
                {['Article', 'Category', 'Author', 'Date', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id} className="border-b border-dark-border/40 last:border-0 hover:bg-dark-border/10">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {post.thumbnail && <img src={post.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                      <span className="text-foreground text-xs font-medium max-w-[160px] truncate">{post.title}</span>
                      {post.pdfUrl && <FileText className="w-3.5 h-3.5 text-primary-text shrink-0" />}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted text-xs">{post.category}</td>
                  <td className="py-3 px-4 text-muted text-xs">{post.authorName}</td>
                  <td className="py-3 px-4 text-muted text-xs">{formatDateShort(post.publishedAt)}</td>
                  <td className="py-3 px-4"><Badge variant={post.isPublished ? 'success' : 'muted'}>{post.isPublished ? 'Published' : 'Draft'}</Badge></td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(post)} title="Edit article" className="text-muted hover:text-primary-text p-1 cursor-pointer disabled:opacity-50" disabled={busyId === post.id}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => togglePublish(post)} title={post.isPublished ? 'Move to drafts' : 'Publish'} className="text-muted hover:text-primary-text p-1 cursor-pointer disabled:opacity-50" disabled={busyId === post.id}>
                        {post.isPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={() => deletePost(post)} title="Delete article" className="text-muted hover:text-red-400 p-1 cursor-pointer disabled:opacity-50" disabled={busyId === post.id}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FadeIn>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editingPost ? 'Edit Article' : 'New Article'} size="xl">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Title" placeholder="Article title" value={form.title} onChange={e => { set('title', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)); }} />
            <Input label="Slug" placeholder="article-slug" value={form.slug} onChange={e => { set('slug', e.target.value); setSlugTouched(true); }} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Category" placeholder="e.g., React, Python" value={form.category} onChange={e => set('category', e.target.value)} />
            <Input label="Tags (comma-separated)" placeholder="e.g., react, hooks" value={form.tags} onChange={e => set('tags', e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Author Name" placeholder="Instructor name (defaults to you)" value={form.authorName} onChange={e => set('authorName', e.target.value)} />
            <Input label="Read Time" placeholder="e.g., 5 min read" value={form.readTime} onChange={e => set('readTime', e.target.value)} />
          </div>
          <Input label="Thumbnail URL" placeholder="https://..." value={form.thumbnail} onChange={e => set('thumbnail', e.target.value)} />
          <Textarea label="Excerpt" placeholder="Brief summary shown in listings" value={form.excerpt} onChange={e => set('excerpt', e.target.value)} rows={2} />
          <RichTextEditor
            key={editingPost ? editingPost.id : 'new'}
            initialHtml={form.content}
            onChange={html => set('content', html)}
            disabled={saving}
          />

          <div>
            <span className="text-sm font-medium text-foreground/80 block mb-1.5">Attached PDF (optional)</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void uploadPdf(file);
                e.target.value = '';
              }}
            />
            {form.pdfUrl ? (
              <div className="flex items-center gap-2 bg-dark-card border border-dark-border rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-primary-text shrink-0" />
                <a href={form.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-text truncate flex-1 hover:underline">View uploaded PDF</a>
                <button
                  type="button"
                  title="Remove PDF"
                  onClick={() => set('pdfUrl', '')}
                  className="text-muted hover:text-red-400 p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" loading={uploading} disabled={uploading || saving} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Upload PDF (max 10 MB)
              </Button>
            )}
            <p className="text-xs text-muted mt-1">A post can have rich text, a PDF, or both. Uploads need the Supabase service-role key configured (see runbook).</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={e => set('isPublished', e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            Publish immediately (uncheck to save as a draft)
          </label>

          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsOpen(false)} disabled={saving}>Cancel</Button>
            <Button fullWidth onClick={savePost} loading={saving} disabled={saving || uploading}>
              {editingPost ? 'Save Changes' : 'Publish Article'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
