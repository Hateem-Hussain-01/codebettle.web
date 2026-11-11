'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import toast from 'react-hot-toast';
import type { SafeUser } from '@/lib/db/types';

interface CourseInstructorClientProps {
  courseId: string;
  currentInstructorId: string;
  instructors: SafeUser[];
}

/**
 * Admin "Assign Instructor" control for an EXISTING course (course detail
 * page). The new-course form already assigns an instructor at creation;
 * this is the missing half: re-assigning a live course.
 *
 * PATCHes { instructorId } to /api/admin/courses/[id] (the existing
 * update endpoint — no new API). The instructor display above is rendered
 * by the server page, so router.refresh() re-fetches it after a save.
 * One instructor may teach many courses (one-to-many, no unique
 * constraint on instructorId), so assigning a course never un-assigns
 * another course from the same teacher.
 */
export default function CourseInstructorClient({ courseId, currentInstructorId, instructors: allInstructors }: CourseInstructorClientProps) {
  const router = useRouter();
  // Only active instructors are offered — same rule as the new-course form.
  // The current instructor stays selectable even if since suspended, so the
  // dropdown always shows the real current assignment.
  const instructors = allInstructors.filter(i => i.status === 'active' || i.id === currentInstructorId);
  const [selectedId, setSelectedId] = useState(currentInstructorId);
  const [saving, setSaving] = useState(false);
  const selected = instructors.find(i => i.id === selectedId);
  const unchanged = selectedId === currentInstructorId;

  const assign = async () => {
    if (!selectedId) { toast.error('Please choose an instructor'); return; }
    if (unchanged) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructorId: selectedId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Could not assign instructor'); return; }
      toast.success(`Instructor assigned to ${selected?.name ?? 'course'}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  if (instructors.length === 0) {
    return (
      <p className="text-muted text-xs mt-4 pt-4 border-t border-dark-border/40">
        No instructors yet — add one from the Instructors page first.
      </p>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-dark-border/40">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <Select
            label="Assign Instructor"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            options={instructors.map(i => ({
              value: i.id,
              label: i.status === 'active' ? i.name : `${i.name} (suspended)`,
            }))}
          />
        </div>
        <Button onClick={assign} loading={saving} disabled={unchanged || !selectedId}>Assign</Button>
      </div>
      {selected && (
        <div className="mt-2 flex items-center gap-2 bg-dark-border/30 rounded-lg px-3 py-2">
          <img src={selected.avatar || ''} className="w-7 h-7 rounded-full border border-primary/30" alt="" />
          <div>
            <p className="text-white text-xs font-medium">{selected.name}</p>
            <p className="text-muted text-xs">{selected.expertise?.slice(0, 2).join(' · ') || selected.email}</p>
          </div>
          {unchanged && <span className="ml-auto text-muted text-xs">Current instructor</span>}
        </div>
      )}
    </div>
  );
}
