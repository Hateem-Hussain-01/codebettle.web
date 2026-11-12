'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Paperclip } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  REQUEST_STATUSES,
  REQUEST_STATUS_BADGE,
  requestCategoryLabel,
  requestStatusLabel,
  resolveAttachmentLink,
  type AdminRequest,
  type RequestStatus,
} from '@/components/requests/request-types';

/**
 * Admin request detail (Phase 3, Worker C).
 * Full message, related course, attachment, admin reply box + status
 * changer. Saves via PATCH /api/admin/requests/[id]
 * ({ status?, adminReply? }); on success the detail refreshes from
 * the PATCH response (enriched names/titles are kept from the
 * server-loaded initial request) and a toast is shown.
 *
 * Attachment: the stored `attachmentUrl` is a PRIVATE-bucket storage
 * path, never a public URL. "Open attachment" calls
 * GET /api/admin/requests/[id]/file, which mints a short-lived signed
 * URL (1 hour), and opens that URL in a new tab. A stored value that
 * is already a signed URL / app path is linked directly instead.
 */
export default function RequestDetailClient({ initialRequest }: { initialRequest: AdminRequest }) {
  const [request, setRequest] = useState<AdminRequest>(initialRequest);
  const [status, setStatus] = useState<RequestStatus>(initialRequest.status as RequestStatus);
  const [adminReply, setAdminReply] = useState(initialRequest.adminReply ?? '');
  const [saving, setSaving] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminReply: adminReply.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not save — please try again.');
        return;
      }
      // PATCH returns the bare row; keep the server-enriched names.
      const updated = (data.request ?? data) as Partial<AdminRequest>;
      setRequest((r) => ({ ...r, ...updated, studentName: r.studentName, studentEmail: r.studentEmail, courseTitle: r.courseTitle }));
      setStatus((updated.status as RequestStatus) ?? status);
      setAdminReply(updated.adminReply ?? adminReply);
      toast.success('Request updated');
    } catch {
      toast.error('Could not save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openAttachment = async () => {
    const direct = resolveAttachmentLink(request.attachmentUrl);
    if (direct) {
      window.open(direct, '_blank', 'noopener,noreferrer');
      return;
    }
    setOpeningFile(true);
    try {
      const res = await fetch(`/api/admin/requests/${request.id}/file`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not open the attachment.');
        return;
      }
      if (typeof data.url === 'string' && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('Could not open the attachment.');
      }
    } catch {
      toast.error('Could not open the attachment.');
    } finally {
      setOpeningFile(false);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <Link href="/admin/requests" className="text-muted text-sm hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to requests
        </Link>
        <h1 className="text-2xl font-black text-foreground mt-2">{request.subject}</h1>
        <p className="text-muted text-sm mt-1">
          {request.studentName} · {request.studentEmail} · {formatDateShort(request.createdAt)}
        </p>
      </FadeIn>

      <FadeIn delay={0.05}>
        <Card>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={REQUEST_STATUS_BADGE[request.status as RequestStatus] ?? 'muted'}>
              {requestStatusLabel(request.status)}
            </Badge>
            <Badge variant="muted">{requestCategoryLabel(request.category)}</Badge>
            {request.courseTitle && <Badge variant="info">{request.courseTitle}</Badge>}
          </div>
          <p className="text-foreground/90 text-sm mt-4 whitespace-pre-line">{request.message}</p>
          {request.attachmentUrl && (
            <div className="mt-4 rounded-lg bg-dark-card border border-dark-border p-3 flex items-center gap-2 text-sm">
              <Paperclip className="w-4 h-4 text-muted flex-shrink-0" />
              <button
                type="button"
                onClick={() => void openAttachment()}
                disabled={openingFile}
                className="text-primary-text hover:underline truncate disabled:opacity-50 cursor-pointer"
              >
                {openingFile ? 'Opening attachment…' : 'Open attachment'}
              </button>
            </div>
          )}
        </Card>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Card>
          <h2 className="font-semibold text-foreground mb-4">Admin reply &amp; status</h2>
          <div className="space-y-4">
            <Select
              label="Status"
              options={REQUEST_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
              value={status}
              onChange={(e) => setStatus(e.target.value as RequestStatus)}
            />
            <Textarea
              label="Reply to student"
              placeholder="Write a reply — the student will see it on their request."
              value={adminReply}
              onChange={(e) => setAdminReply(e.target.value)}
              rows={4}
            />
            <Button onClick={handleSave} loading={saving}>Save reply &amp; status</Button>
          </div>
        </Card>
      </FadeIn>
    </div>
  );
}
