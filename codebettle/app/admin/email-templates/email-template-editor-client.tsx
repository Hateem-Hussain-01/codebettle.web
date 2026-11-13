'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, Send, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import RichTextEditor from '@/components/ui/RichTextEditor';
import toast from 'react-hot-toast';
import { EMAIL_PLACEHOLDERS } from '@/lib/email/placeholders';
import type { EmailTemplate, EmailTemplateType } from '@/lib/db/types';

interface EditorProps {
  /** Undefined = create a new template. */
  templateId?: string;
}

/**
 * Admin email-template editor (email builder, GHL-style).
 *
 * - Subject field (write/edit, like GoHighLevel).
 * - HTML body textarea with a placeholder-insert toolbar: clicking a
 *   placeholder inserts {{KEY}} at the cursor. Placeholders resolve
 *   per recipient from real portal data at send time.
 * - Live preview with sample data (rendered server-side, exactly as
 *   the test email sends it).
 * - Save as draft (inactive) or active, delete, and send a test email
 *   to the admin's own inbox.
 */
export default function EmailTemplateEditorClient({ templateId }: EditorProps) {
  const router = useRouter();
  const isNew = !templateId;
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [type, setType] = useState<EmailTemplateType>('broadcast');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/email-templates/${templateId}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Could not load the template');
        if (cancelled) return;
        const t: EmailTemplate = body.template;
        setName(t.name);
        setSubject(t.subject);
        setHtmlBody(t.htmlBody);
        setType(t.type);
        setIsActive(t.isActive);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load the template');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, templateId]);

  const handlePreview = async () => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const res = await fetch('/api/admin/email-templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, htmlBody }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not render the preview');
      setPreviewHtml(body.html ?? '');
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Could not render the preview');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Template name is required');
      return;
    }
    if (!subject.trim()) {
      toast.error('Subject is required');
      return;
    }
    if (!htmlBody.trim()) {
      toast.error('Email body is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        isNew ? '/api/admin/email-templates' : `/api/admin/email-templates/${templateId}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), subject: subject.trim(), htmlBody, type, isActive }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Could not save the template');
        return;
      }
      toast.success(isNew ? 'Template created' : 'Template saved');
      router.push('/admin/email-templates');
      router.refresh();
    } catch {
      toast.error('Could not save the template — please try again');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNew) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/email-templates/${templateId}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Could not delete the template');
        return;
      }
      toast.success('Template deleted');
      router.push('/admin/email-templates');
      router.refresh();
    } catch {
      toast.error('Could not delete the template — please try again');
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async () => {
    if (isNew) {
      toast.error('Save the template first, then send a test email');
      return;
    }
    setTesting(true);
    try {
      const res = await fetch(`/api/admin/email-templates/${templateId}/test`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Could not send the test email');
        return;
      }
      if (body.sent) {
        toast.success(`Test email sent to ${body.to ?? 'your inbox'}`);
      } else if (body.reason === 'email-not-configured') {
        toast.error('Email is not configured yet — add the Resend API key in Vercel and verify codebettle.com in Resend first');
      } else {
        toast.error('Test email could not be sent — please try again');
      }
    } catch {
      toast.error('Could not send the test email — please try again');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-red-400">{loadError}</p>
        <Button variant="secondary" className="mt-4" onClick={() => router.push('/admin/email-templates')}>
          Back to templates
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <button
          type="button"
          onClick={() => router.push('/admin/email-templates')}
          className="flex items-center gap-1 text-sm text-muted hover:text-foreground transition-colors cursor-pointer mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> All templates
        </button>
        <h1 className="text-2xl font-black text-foreground">
          {isNew ? 'New email template' : 'Edit email template'}
        </h1>
        <p className="text-muted text-sm mt-1">
          Write the subject and body, insert placeholders for data from the student portal,
          then preview with sample data before saving.
        </p>
      </div>

      <Card className="p-5 sm:p-6 space-y-4">
        <Input
          label="Template name"
          placeholder="e.g. Welcome email for new students"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
        <Input
          label="Subject"
          placeholder="e.g. Welcome to CodeBettle, {{STUDENT_NAME}}!"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
        />
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as EmailTemplateType)}
          options={[
            { value: 'broadcast', label: 'Broadcast — sent via notifications' },
            { value: 'system', label: 'System — mirrors a code template' },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="accent-yellow-500"
          />
          Active
          <span className="text-muted text-xs">(inactive templates are drafts — not offered when composing a notification)</span>
        </label>

        <RichTextEditor
          key={templateId ?? 'new'}
          label="Email body"
          initialHtml={htmlBody}
          onChange={setHtmlBody}
          placeholders={EMAIL_PLACEHOLDERS}
        />

        <div className="flex flex-wrap gap-3 pt-1">
          <Button onClick={handleSave} loading={saving}>
            {isNew ? 'Create template' : 'Save changes'}
          </Button>
          <Button variant="secondary" onClick={handlePreview} loading={previewing}>
            <Eye className="w-4 h-4 mr-1" /> Preview
          </Button>
          {!isNew && (
            <Button variant="secondary" onClick={handleTest} loading={testing}>
              <Send className="w-4 h-4 mr-1" /> Send test email
            </Button>
          )}
          {!isNew && (
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
          )}
        </div>
      </Card>

      {previewError && (
        <Card className="p-4 border-red-500/50">
          <p className="text-sm text-red-400">{previewError}</p>
        </Card>
      )}

      {previewHtml !== null && (
        <Card className="p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Preview (sample data)</h2>
            <span className="text-xs text-muted">Rendered exactly as the test email sends it</span>
          </div>
          <div className="rounded-lg overflow-hidden border border-dark-border">
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={previewHtml}
              className="w-full"
              style={{ height: 560, backgroundColor: '#0A0A0A' }}
            />
          </div>
        </Card>
      )}

      <Modal isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete template?">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Delete <span className="text-foreground font-semibold">{name || 'this template'}</span>?
            This cannot be undone. Broadcasts already sent are not affected.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" fullWidth onClick={handleDelete} loading={deleting}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
