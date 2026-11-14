'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdminUrl } from '@/components/admin/AdminBasePathContext';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import FadeIn from '@/components/ui/FadeIn';
import { Search, Plus, Trash2, CheckCircle } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Course, Enrollment, EnrollmentPaymentStatus, SafeUser } from '@/lib/db/types';

interface EnrollmentsClientProps {
  students: SafeUser[];
  courses: Course[];
}

type DeleteTarget = { id: string; label: string } | null;

const PAYMENT_OPTIONS = [
  { value: 'paid', label: 'Paid' },
  { value: 'free', label: 'Free' },
  { value: 'pending', label: 'Pending' },
];

// Phase 2 (paid-with-no-proof fix): the CREATE form may not offer 'paid' —
// a new enrolment has no linked approved submission yet, so 'paid' is only
// reachable through the payment verification flow. The EDIT form keeps the
// full list (PATCH enforces the approved-submission requirement itself).
const CREATE_PAYMENT_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'pending', label: 'Pending' },
];

/**
 * Admin enrollments — wired to /api/admin/enrollments (Phase 3).
 * The list is fetched page by page (25 per page by default); the old
 * 100-row dump is gone. Create / mark-complete / payment edits /
 * delete all go through the API and update the list from the response.
 */
export default function EnrollmentsClient({ students, courses }: EnrollmentsClientProps) {
  const adminUrl = useAdminUrl();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Enrollment | null>(null);
  const [saving, setSaving] = useState(false);
  const [newForm, setNewForm] = useState({ studentId: '', courseId: '', paymentStatus: 'pending' as EnrollmentPaymentStatus, amountPaid: '', couponUsed: '' });
  const [editForm, setEditForm] = useState({ paymentStatus: 'paid' as EnrollmentPaymentStatus, amountPaid: '', certificateEligible: false });

  const studentMap = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const courseMap = useMemo(() => Object.fromEntries(courses.map(c => [c.id, c])), [courses]);

  const loadEnrollments = useCallback(async (p: number, l: number) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/admin/enrollments?page=${p}&limit=${l}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load enrollments');
      setEnrollments(data.enrollments);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load enrollments');
    } finally {
      setLoading(false);
    }
  }, []);

  // Mount-time data fetch for this client page (the standard fetch-on-mount
  // pattern: loading -> loaded is the intended transition, not a render
  // cascade). The React 19 use()+Suspense rewrite is a Phase 3 polish.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { loadEnrollments(page, limit); }, [page, limit, loadEnrollments]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtered = enrollments.filter(e =>
    (studentMap[e.studentId]?.name.toLowerCase().includes(search.toLowerCase()) ||
      courseMap[e.courseId]?.title.toLowerCase().includes(search.toLowerCase()))
  );

  const createEnrollment = async () => {
    if (!newForm.studentId || !newForm.courseId) { toast.error('Choose a student and a course'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: newForm.studentId,
          courseId: newForm.courseId,
          paymentStatus: newForm.paymentStatus,
          amountPaid: Math.floor(Number(newForm.amountPaid) || 0),
          couponUsed: newForm.couponUsed.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not create enrollment'); return; }
      setIsCreateOpen(false);
      setNewForm({ studentId: '', courseId: '', paymentStatus: 'pending', amountPaid: '', couponUsed: '' });
      toast.success('Enrollment created');
      loadEnrollments(1, limit);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (enrollment: Enrollment) => {
    setEditTarget(enrollment);
    setEditForm({
      paymentStatus: enrollment.paymentStatus,
      amountPaid: String(enrollment.amountPaid),
      certificateEligible: enrollment.certificateEligible ?? false,
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/enrollments/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus: editForm.paymentStatus,
          amountPaid: Math.floor(Number(editForm.amountPaid) || 0),
          certificateEligible: editForm.certificateEligible,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not update enrollment'); return; }
      setEnrollments(es => es.map(e => e.id === editTarget.id ? data.enrollment : e));
      setEditTarget(null);
      toast.success('Enrollment updated');
    } finally {
      setSaving(false);
    }
  };

  const markComplete = async (enrollment: Enrollment) => {
    const res = await fetch(`/api/admin/enrollments/${enrollment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted: true }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Could not mark complete'); return; }
    setEnrollments(es => es.map(e => e.id === enrollment.id ? data.enrollment : e));
    toast.success('Enrollment marked as complete');
  };

  const deleteEnrollment = async (id: string) => {
    const res = await fetch(`/api/admin/enrollments/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Could not delete enrollment'); return; }
    setEnrollments(es => es.filter(e => e.id !== id));
    setDeleteTarget(null);
    toast.success('Enrollment deleted');
    loadEnrollments(page, limit);
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Enrollments</h1>
          <p className="text-muted text-sm mt-1">{total} total enrollments</p>
        </div>
        <div className="flex gap-2 items-center">
          <Link href={adminUrl("/payments")}>
            <Button variant="secondary">Payment Verifications</Button>
          </Link>
          <Button onClick={() => setIsCreateOpen(true)}><Plus className="w-4 h-4" />New Enrollment</Button>
        </div>
      </FadeIn>

      <Input placeholder="Search by student or course..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} className="max-w-sm" />

      {loading && <p className="text-muted text-sm">Loading enrollments…</p>}
      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          {loadError} <button onClick={() => loadEnrollments(page, limit)} className="underline cursor-pointer ml-2">Retry</button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <FadeIn delay={0.08} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border bg-dark-border/20">
                    {['Student', 'Course', 'Enrolled', 'Lessons', 'Payment', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="py-8 px-4 text-center text-muted text-sm">No enrollments found.</td></tr>
                  )}
                  {filtered.map(enrollment => {
                    const student = studentMap[enrollment.studentId];
                    const course = courseMap[enrollment.courseId];
                    return (
                      <tr key={enrollment.id} className="border-b border-dark-border/40 last:border-0 hover:bg-dark-border/10 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <img src={student?.avatar || ''} alt={student?.name} className="w-7 h-7 rounded-full" />
                            <span className="text-foreground text-xs font-medium">{student?.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted text-xs max-w-[160px] truncate">{course?.title}</td>
                        <td className="py-3 px-4 text-muted text-xs">{formatDateShort(enrollment.enrolledAt)}</td>
                        <td className="py-3 px-4 text-muted text-xs">{enrollment.completedLessons.length}</td>
                        <td className="py-3 px-4">
                          <Badge variant={enrollment.paymentStatus === 'free' ? 'muted' : 'success'}>
                            {enrollment.paymentStatus === 'free' ? 'Free' : `PKR ${enrollment.amountPaid.toLocaleString()}`}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={enrollment.isCompleted ? 'success' : 'info'}>
                            {enrollment.isCompleted ? 'Completed' : 'Active'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            {!enrollment.isCompleted && (
                              <button onClick={() => markComplete(enrollment)} title="Mark complete" className="text-muted hover:text-green-400 transition-colors p-1 cursor-pointer">
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            <Button size="sm" variant="secondary" onClick={() => openEdit(enrollment)}>Edit</Button>
                            <button onClick={() => setDeleteTarget({ id: enrollment.id, label: `${student?.name} — ${course?.title}` })} title="Delete" className="text-muted hover:text-red-400 transition-colors p-1 cursor-pointer">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </FadeIn>

          {/* Pagination */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-muted text-xs">Page {page} of {totalPages} · {total} total</p>
            <div className="flex items-center gap-2">
              <Select
                value={String(limit)}
                onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                options={[{ value: '10', label: '10 per page' }, { value: '25', label: '25 per page' }, { value: '50', label: '50 per page' }]}
              />
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</Button>
            </div>
          </div>
        </>
      )}

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New Enrollment">
        <div className="space-y-4">
          <Select
            label="Student *"
            value={newForm.studentId}
            onChange={e => setNewForm(f => ({ ...f, studentId: e.target.value }))}
            options={[{ value: '', label: 'Select a student' }, ...students.filter(s => s.status === 'active').map(s => ({ value: s.id, label: `${s.name} (${s.email})` }))]}
          />
          <Select
            label="Course *"
            value={newForm.courseId}
            onChange={e => setNewForm(f => ({ ...f, courseId: e.target.value }))}
            options={[{ value: '', label: 'Select a course' }, ...courses.map(c => ({ value: c.id, label: c.title }))]}
          />
          <Select
            label="Payment Status"
            value={newForm.paymentStatus}
            onChange={e => setNewForm(f => ({ ...f, paymentStatus: e.target.value as EnrollmentPaymentStatus }))}
            options={CREATE_PAYMENT_OPTIONS}
          />
          <Input label="Amount Paid (PKR)" type="number" placeholder="0" value={newForm.amountPaid} onChange={e => setNewForm(f => ({ ...f, amountPaid: e.target.value }))} />
          <Input label="Coupon Used (optional)" placeholder="Coupon code" value={newForm.couponUsed} onChange={e => setNewForm(f => ({ ...f, couponUsed: e.target.value }))} />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button fullWidth onClick={createEnrollment} loading={saving}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Enrollment">
        {editTarget && (
          <div className="space-y-4">
            <p className="text-muted text-sm">{studentMap[editTarget.studentId]?.name} — {courseMap[editTarget.courseId]?.title}</p>
            <Select
              label="Payment Status"
              value={editForm.paymentStatus}
              onChange={e => setEditForm(f => ({ ...f, paymentStatus: e.target.value as EnrollmentPaymentStatus }))}
              options={PAYMENT_OPTIONS}
            />
            <Input label="Amount Paid (PKR)" type="number" placeholder="0" value={editForm.amountPaid} onChange={e => setEditForm(f => ({ ...f, amountPaid: e.target.value }))} />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editForm.certificateEligible} onChange={e => setEditForm(f => ({ ...f, certificateEligible: e.target.checked }))} className="w-4 h-4 accent-primary" />
              <span className="text-sm text-foreground/80">Certificate eligible</span>
            </label>
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button fullWidth onClick={saveEdit} loading={saving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Enrollment" size="sm">
        <p className="text-muted text-sm mb-6">Delete the enrollment for <span className="text-foreground font-medium">{deleteTarget?.label}</span>? This cannot be undone.</p>
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={() => deleteEnrollment(deleteTarget!.id)}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
