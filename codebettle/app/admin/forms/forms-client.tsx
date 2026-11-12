'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, Eye, EyeOff, Pencil, ListChecks, Inbox, ExternalLink,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import { formatDateShort } from '@/lib/utils';
import FormShareMenu from './form-share-menu';
import { submissionCountOf, formStatusLabel, formTypeLabel, type AdminFormListItem, type FormStatus } from '@/lib/forms';
import toast from 'react-hot-toast';

/**
 * Admin forms list + create (Phase 6, Worker B).
 * Every control calls a real API (Worker A's /api/admin/forms):
 * list, create (POST, new forms start as drafts with an empty
 * schema), publish/unpublish toggle (PATCH status), delete (DELETE
 * with confirmation). Clicking a row opens the 3-pane builder;
 * clicking a form's name (or its submissions count) opens its
 * submissions instead.
 */
export default function FormsClient() {
  const router = useRouter();
  const [forms, setForms] = useState<AdminFormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  // Purpose is free text — prefilled 'General', the admin can
  // overwrite it with anything (Registration, Feedback, …).
  const [createType, setCreateType] = useState('General');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminFormListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadForms = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/forms?limit=100');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body.error ?? 'Could not load forms');
        return;
      }
      setForms(Array.isArray(body.forms) ? body.forms : []);
    } catch {
      setLoadError('Could not load forms — check your connection and try again');
    } finally {
      setLoading(false);
    }
  }, []);

  // Deferred to a microtask: the loader sets state synchronously at
  // its start, and calling it directly in the effect body trips the
  // react-hooks/set-state-in-effect rule. Same loader as Refresh.
  useEffect(() => {
    void Promise.resolve().then(() => loadForms());
  }, [loadForms]);

  const visibleForms = useMemo(
    () => forms.filter((f) => !statusFilter || f.status === statusFilter),
    [forms, statusFilter],
  );

  const createForm = async () => {
    if (!createName.trim()) {
      toast.error('Form name required');
      return;
    }
    if (!createType.trim() || createType.trim().length > 50) {
      toast.error('Purpose is required (max 50 characters)');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          type: createType.trim(),
          description: createDescription.trim() || undefined,
          // The API requires a schema key; new forms start as drafts
          // with an empty field list (per the brief).
          schema: { fields: [] },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'Could not create the form');
        return;
      }
      const created = body.form as AdminFormListItem;
      toast.success(`"${created.name}" created as a draft`);
      setIsCreateOpen(false);
      setCreateName('');
      setCreateDescription('');
      setCreateType('General');
      router.push(`/admin/forms/${created.id}/builder`);
    } catch {
      toast.error('Could not create the form — check your connection and try again');
    } finally {
      setCreating(false);
    }
  };

  const togglePublish = async (form: AdminFormListItem) => {
    const nextStatus: FormStatus = form.status === 'published' ? 'draft' : 'published';
    setBusyId(form.id);
    try {
      const res = await fetch(`/api/admin/forms/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'Could not update the form');
        return;
      }
      const saved = body.form as AdminFormListItem;
      setForms((fs) => fs.map((f) => (f.id === saved.id ? saved : f)));
      toast.success(saved.status === 'published' ? 'Form published' : 'Form moved to drafts');
    } catch {
      toast.error('Could not update the form — check your connection and try again');
    } finally {
      setBusyId(null);
    }
  };

  const deleteForm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/forms/${deleteTarget.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'Could not delete the form');
        return;
      }
      setForms((fs) => fs.filter((f) => f.id !== deleteTarget.id));
      toast.success('Form deleted');
      setDeleteTarget(null);
    } catch {
      toast.error('Could not delete the form — check your connection and try again');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">Forms</h1>
          <p className="text-muted text-sm mt-1">
            Forms for any purpose ({forms.length} total)
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4" />New Form
        </Button>
      </FadeIn>

      <FadeIn delay={0.05} className="flex flex-col sm:flex-row gap-3">
        <div className="sm:w-52">
          <Select
            label="Status"
            options={[
              { value: '', label: 'All statuses' },
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button variant="outline" size="sm" onClick={() => void loadForms()}>
            Refresh
          </Button>
        </div>
      </FadeIn>

      {loading ? (
        <Card className="py-16 text-center">
          <Spinner className="mx-auto" />
          <p className="text-muted text-sm mt-3">Loading forms…</p>
        </Card>
      ) : loadError ? (
        <Card className="py-16 text-center">
          <p className="text-foreground font-medium">Couldn&apos;t load forms</p>
          <p className="text-muted text-sm mt-1">{loadError}</p>
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => void loadForms()}>Try again</Button>
          </div>
        </Card>
      ) : visibleForms.length === 0 ? (
        <Card className="py-16 text-center">
          <Inbox className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">
            {forms.length === 0 ? 'No forms yet' : 'No forms match these filters'}
          </p>
          <p className="text-muted text-sm mt-1">
            {forms.length === 0
              ? 'Create your first form for any purpose — registration, feedback, job applications and more.'
              : 'Try clearing the status filter.'}
          </p>
          {forms.length === 0 && (
            <div className="mt-4 flex justify-center">
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="w-4 h-4" />Create your first form
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <FadeIn delay={0.08} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border bg-dark-border/20">
                  {['Form', 'Type', 'Status', 'Submissions', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleForms.map((form) => (
                  <tr
                    key={form.id}
                    className="border-b border-dark-border/40 last:border-0 hover:bg-dark-border/10 cursor-pointer"
                    onClick={() => router.push(`/admin/forms/${form.id}/builder`)}
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/forms/${form.id}/submissions`);
                        }}
                        title="View submissions"
                        className="text-foreground text-sm font-medium hover:text-primary-text hover:underline text-left cursor-pointer"
                      >
                        {form.name}
                      </button>
                      <p className="text-muted text-xs mt-0.5 truncate max-w-[280px]">
                        /{form.slug}{form.description ? ` · ${form.description}` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="info">{formTypeLabel(form.type)}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={form.status === 'published' ? 'success' : 'muted'}>{formStatusLabel(form.status)}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/forms/${form.id}/submissions`);
                        }}
                        title="View submissions"
                        className="text-muted text-xs hover:text-primary-text hover:underline cursor-pointer"
                      >
                        {submissionCountOf(form)}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-muted text-xs">{formatDateShort(form.createdAt)}</td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => router.push(`/admin/forms/${form.id}/builder`)}
                          title="Open builder"
                          className="text-muted hover:text-primary-text p-1 cursor-pointer disabled:opacity-50"
                          disabled={busyId === form.id}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => router.push(`/admin/forms/${form.id}/submissions`)}
                          title="View submissions"
                          className="text-muted hover:text-primary-text p-1 cursor-pointer"
                        >
                          <ListChecks className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void togglePublish(form)}
                          title={form.status === 'published' ? 'Move to drafts' : 'Publish'}
                          className="text-muted hover:text-primary-text p-1 cursor-pointer disabled:opacity-50"
                          disabled={busyId === form.id}
                        >
                          {form.status === 'published' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => window.open(`/forms/${form.slug}?preview=1`, '_blank', 'noopener,noreferrer')}
                          title="Preview form in a new tab (admin preview — drafts included)"
                          className="text-muted hover:text-primary-text p-1 cursor-pointer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        {form.status === 'published' && (
                          <FormShareMenu name={form.name} slug={form.slug} variant="icon" />
                        )}
                        <button
                          onClick={() => setDeleteTarget(form)}
                          title="Delete form"
                          className="text-muted hover:text-red-400 p-1 cursor-pointer disabled:opacity-50"
                          disabled={busyId === form.id}
                        >
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
      )}

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New Form">
        <div className="space-y-4">
          <Input
            label="Form name"
            placeholder="e.g. Spring 2027 Registration"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
          <Input
            label="Purpose"
            placeholder="Registration, Feedback, Job Application…"
            value={createType}
            onChange={(e) => setCreateType(e.target.value)}
            maxLength={50}
          />
          <Textarea
            label="Description (optional)"
            placeholder="What is this form for?"
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted">
            The form starts as a draft with an empty schema — you add fields in the builder next.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button fullWidth onClick={() => void createForm()} loading={creating} disabled={creating}>
              Create &amp; open builder
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete form?">
        <div className="space-y-4">
          <p className="text-sm text-foreground/90">
            Delete <span className="font-semibold text-foreground">&ldquo;{deleteTarget?.name}&rdquo;</span>?
            Its fields and all submitted responses will be permanently removed.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" fullWidth onClick={() => void deleteForm()} loading={deleting} disabled={deleting}>
              Delete form
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
