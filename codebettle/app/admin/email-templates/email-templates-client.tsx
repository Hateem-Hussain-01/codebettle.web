'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminUrl } from '@/components/admin/AdminBasePathContext';
import { Plus, Trash2, Pencil, Mail, AlertTriangle, Send } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import toast from 'react-hot-toast';
import type { EmailTemplate } from '@/lib/db/types';
import { SYSTEM_EMAILS } from '@/lib/email/registry';

/**
 * Admin email management (email builder).
 * Two sections:
 * - Custom templates: the builder's own templates (list, create,
 *   edit, delete, send test). Loaded from GET /api/admin/email-templates.
 * - System emails: every email the app can send, with its purpose,
 *   trigger, recipient and active status (lib/email/registry.ts).
 *   These are wired in code — the list is the single place to see
 *   what emails exist and why.
 * A delivery banner shows whether email can actually be delivered
 * (Resend configured) or is still inert.
 * Every control calls a real API (/api/admin/email-templates).
 * When the EmailTemplate table has not been created yet (SQL not run),
 * the custom-templates section shows a "run the SQL" state instead of
 * an error — nothing else on the site is affected.
 */
export default function EmailTemplatesClient() {
  const router = useRouter();
  const adminUrl = useAdminUrl();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setTableMissing(false);
    try {
      const res = await fetch('/api/admin/email-templates');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body.error ?? 'Could not load email templates');
        return;
      }
      setTemplates(Array.isArray(body.templates) ? body.templates : []);
      setTableMissing(body.tableMissing === true);
      setEmailConfigured(typeof body.emailConfigured === 'boolean' ? body.emailConfigured : null);
    } catch {
      setLoadError('Could not load email templates — check your connection and try again');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/email-templates/${deleteTarget.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Could not delete the template');
        return;
      }
      toast.success('Template deleted');
      setDeleteTarget(null);
      loadTemplates();
    } catch {
      toast.error('Could not delete the template — please try again');
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async (template: EmailTemplate) => {
    setTestingId(template.id);
    try {
      const res = await fetch(`/api/admin/email-templates/${template.id}/test`, { method: 'POST' });
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
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-foreground">Email Templates</h1>
            <p className="text-muted text-sm mt-1">
              Build emails like in GoHighLevel: write the subject, add placeholders, preview, and send.
              Templates can be picked when composing a notification.
            </p>
          </div>
          <Button onClick={() => router.push(adminUrl('/email-templates/new'))} disabled={tableMissing}>
            <Plus className="w-4 h-4 mr-1" /> New template
          </Button>
        </div>
      </FadeIn>

      {emailConfigured !== null && (
        <Card className={`p-4 ${emailConfigured ? 'border-green-500/40' : 'border-amber-500/50'}`}>
          <p className={`flex items-center gap-2 font-semibold text-sm ${emailConfigured ? 'text-green-400' : 'text-amber-400'}`}>
            <AlertTriangle className="w-5 h-5" />
            {emailConfigured
              ? 'Email delivery is on — emails will be sent when their trigger fires.'
              : 'Email delivery is off — no email is actually sent yet.'}
          </p>
          {!emailConfigured && (
            <p className="text-muted text-sm mt-1">
              Add the Resend API key in Vercel (<span className="font-mono">RESEND_API_KEY</span>) and
              verify <span className="font-mono">codebettle.com</span> in Resend. Until then every
              email below is created and logged, but not delivered.
            </p>
          )}
        </Card>
      )}

      {tableMissing && (
        <Card className="p-4 border-amber-500/50">
          <p className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <AlertTriangle className="w-5 h-5" />
            Email templates are not set up yet
          </p>
          <p className="text-muted text-sm mt-1">
            Run the email-template SQL file in the Supabase SQL Editor first
            (codebettle-email-template-migration.sql), then reload this page.
            Nothing else on the site is affected.
          </p>
        </Card>
      )}

      <h2 className="text-lg font-bold text-foreground">Custom templates</h2>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : loadError ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-red-400">{loadError}</p>
          <Button variant="secondary" className="mt-4" onClick={loadTemplates}>
            Try again
          </Button>
        </Card>
      ) : templates.length === 0 ? (
        <Card className="p-8 text-center">
          <Mail className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-semibold">No email templates yet</p>
          <p className="text-muted text-sm mt-1">
            Create your first template — for example a welcome email for new students,
            or a course announcement with placeholders.
          </p>
          <Button className="mt-4" onClick={() => router.push(adminUrl('/email-templates/new'))} disabled={tableMissing}>
            <Plus className="w-4 h-4 mr-1" /> New template
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <Card key={template.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <button
                  type="button"
                  onClick={() => router.push(adminUrl(`/email-templates/${template.id}`))}
                  className="text-left cursor-pointer min-w-0"
                >
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-foreground font-semibold hover:text-primary-text transition-colors">
                      {template.name}
                    </span>
                    <Badge>{template.type === 'system' ? 'System' : 'Broadcast'}</Badge>
                    {!template.isActive && <Badge>Draft</Badge>}
                  </span>
                  <span className="block text-muted text-sm mt-1 truncate">{template.subject}</span>
                  <span className="block text-muted text-xs mt-1">
                    Created {new Date(template.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </button>
                <span className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label={`Send a test email for ${template.name}`}
                    title="Send a test email to yourself"
                    onClick={() => handleTest(template)}
                    disabled={testingId === template.id}
                    className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-dark-border transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Edit ${template.name}`}
                    title="Edit"
                    onClick={() => router.push(adminUrl(`/email-templates/${template.id}`))}
                    className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-dark-border transition-colors cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${template.name}`}
                    title="Delete"
                    onClick={() => setDeleteTarget(template)}
                    className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-dark-border transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="text-lg font-bold text-foreground">System emails</h2>
      <p className="text-muted text-sm -mt-4">
        Every email the app can send, what it is for, what triggers it, and who receives it.
        These are wired in code — recipients can still turn their own email notifications off
        from their portal preferences.
      </p>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border text-left text-muted">
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Purpose</th>
                <th className="px-4 py-3 font-semibold">Trigger</th>
                <th className="px-4 py-3 font-semibold">Recipient</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {SYSTEM_EMAILS.map((email) => (
                <tr key={email.key} className="border-b border-dark-border last:border-b-0">
                  <td className="px-4 py-3 text-foreground font-semibold whitespace-nowrap">{email.name}</td>
                  <td className="px-4 py-3 text-muted">{email.purpose}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{email.trigger}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{email.recipient}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge variant={email.active ? 'success' : 'muted'}>
                      {email.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete template?"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Delete <span className="text-foreground font-semibold">{deleteTarget?.name}</span>? This
            cannot be undone. Broadcasts already sent are not affected.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)} disabled={deleting}>
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
