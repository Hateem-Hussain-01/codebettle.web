'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import toast from 'react-hot-toast';

// Placeholders a certificate template is expected to carry (same list
// as CERTIFICATE_PLACEHOLDERS in lib/certificates/template.ts —
// duplicated here so this client component does not pull the server
// QR/PDF modules into the browser bundle). Missing ones only warn.
const CERTIFICATE_PLACEHOLDERS = ['{{STUDENT_NAME}}', '{{COURSE_NAME}}', '{{COURSE_ICON}}', '{{BATCH}}', '{{CERTIFICATE_NUMBER}}', '{{SIGNATURE_NAME}}', '{{SIGNATURE_TITLE}}', '{{QR_CODE}}'];

interface CourseCertificateTemplateClientProps {
  courseId: string;
  initialTemplate: string | null;
}

/**
 * Admin course certificate-template section (Phase 2) on the admin
 * course detail page. Attaches (or replaces / removes) this course's
 * own HTML certificate template, via PATCH /api/admin/courses/[id].
 * Without a template the course's certificate PDFs use the default
 * CodeBettle design. The template is stored as text on the course —
 * no Storage bucket, no repo file — and is rendered server-side to
 * PDF only, never served as HTML.
 */
export default function CourseCertificateTemplateClient({ courseId, initialTemplate }: CourseCertificateTemplateClientProps) {
  const router = useRouter();
  const [template, setTemplate] = useState(initialTemplate ?? '');
  const [attached, setAttached] = useState(Boolean(initialTemplate));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const missingPlaceholders = template.trim()
    ? CERTIFICATE_PLACEHOLDERS.filter(p => !template.includes(p))
    : [];

  const onTemplateFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTemplate(await file.text());
    e.target.value = '';
  };

  const save = async () => {
    if (!template.trim()) { toast.error('Paste the certificate HTML first'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateTemplateHtml: template }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not save the template'); return; }
      setAttached(true);
      toast.success('Certificate template attached — new downloads use this design');
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateTemplateHtml: null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not remove the template'); return; }
      setTemplate('');
      setAttached(false);
      toast.success('Template removed — the default certificate design applies again');
      router.refresh();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <FadeIn delay={0.05}>
      <Card>
        <h2 className="text-foreground font-bold mb-1 text-sm">Certificate Template</h2>
        <p className="text-muted text-xs mb-4">
          {attached
            ? 'A custom template is attached — certificate PDFs for this course use this design.'
            : 'No template attached — certificate PDFs for this course use the default CodeBettle design.'}
        </p>
        <div className="space-y-3">
          <Textarea
            label="Certificate HTML"
            placeholder="Paste the full certificate HTML template here…"
            value={template}
            onChange={e => setTemplate(e.target.value)}
            rows={6}
          />
          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-2">Or upload a .html file</label>
            <input
              type="file"
              accept=".html,text/html"
              onChange={onTemplateFile}
              className="text-sm text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-dark-border file:bg-dark-border/30 file:text-foreground file:text-xs file:cursor-pointer cursor-pointer"
            />
          </div>
          {template.trim() && (
            <p className="text-xs text-muted">
              {template.length.toLocaleString()} characters.
              {missingPlaceholders.length > 0 && (
                <span className="text-amber-400"> Missing placeholders (the PDF will leave those parts blank): {missingPlaceholders.join(', ')}</span>
              )}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={saving}>Save Template</Button>
            {attached && (
              <Button size="sm" variant="secondary" onClick={remove} loading={removing}>Remove Template</Button>
            )}
          </div>
        </div>
      </Card>
    </FadeIn>
  );
}
