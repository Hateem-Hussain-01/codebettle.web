'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import toast from 'react-hot-toast';

interface CourseOutlineClientProps {
  courseId: string;
  initialOutlineUrl: string | null;
}

/**
 * Admin course outline section on the admin course detail page.
 * Sets (or replaces / removes) this course's public outline PDF URL,
 * via PATCH /api/admin/courses/[id]. The URL (e.g. a Supabase Storage
 * public link) shows as a "Download Course Outline (PDF)" button on the
 * public course detail page for everyone to see. Without one, no button
 * renders. The PDF itself lives in Storage; only the URL is stored.
 */
export default function CourseOutlineClient({ courseId, initialOutlineUrl }: CourseOutlineClientProps) {
  const router = useRouter();
  const [outlineUrl, setOutlineUrl] = useState(initialOutlineUrl ?? '');
  const [attached, setAttached] = useState(Boolean(initialOutlineUrl));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const save = async () => {
    const url = outlineUrl.trim();
    if (!url) { toast.error('Paste the outline PDF URL first'); return; }
    try {
      // Must be a valid http(s) URL — the server validates this too
      // (courseUpdateSchema), but fail fast here for a clear message.
      new URL(url);
    } catch {
      toast.error('That is not a valid URL');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outlineUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not save the outline URL'); return; }
      setAttached(true);
      toast.success('Course outline saved — it shows on the public course page');
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
        body: JSON.stringify({ outlineUrl: null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not remove the outline'); return; }
      setOutlineUrl('');
      setAttached(false);
      toast.success('Outline removed — no download button on the course page');
      router.refresh();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <FadeIn delay={0.05}>
      <Card>
        <h2 className="text-foreground font-bold mb-1 text-sm">Course Outline</h2>
        <p className="text-muted text-xs mb-4">
          {attached
            ? 'An outline PDF is attached — it shows as a download button on the public course page.'
            : 'No outline attached — no download button on the public course page.'}
        </p>
        <div className="space-y-3">
          <Input
            label="Outline PDF URL"
            placeholder="https://…/course-outline.pdf"
            value={outlineUrl}
            onChange={e => setOutlineUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={saving}>Save Outline</Button>
            {attached && (
              <Button size="sm" variant="secondary" onClick={remove} loading={removing}>Remove Outline</Button>
            )}
          </div>
        </div>
      </Card>
    </FadeIn>
  );
}
