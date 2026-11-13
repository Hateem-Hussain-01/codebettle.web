'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { formatDate } from '@/lib/utils';
import type { Batch, BatchStatus, Enrollment, SafeUser } from '@/lib/db/types';
import toast from 'react-hot-toast';

interface CourseBatchesClientProps {
  courseId: string;
  /** Teachers the admin can assign as a batch instructor. */
  instructors: SafeUser[];
  /** Enrolled students of this course (name/email lookup for batch detail). */
  enrollments: Enrollment[];
  /** Student lookup by id. */
  studentMap: Record<string, SafeUser>;
}

const STATUS_LABELS: Record<BatchStatus, string> = {
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  completed: 'Completed',
};

/**
 * Admin Batches section on the admin course detail page.
 * Lists the course's batches (number, status, start/end, capacity,
 * enrolled count), creates a new batch (number defaults to the next
 * free one), and edits a batch's status, dates, capacity and
 * instructor via PATCH /api/admin/batches/[id]. Expanding a batch
 * shows its enrolled students with payment status and an "Issue
 * certificate" button per completed enrolment (POST
 * /api/admin/certificates — the certificate takes its batch from the
 * enrolment). When the Batch table has not been created yet (the SQL
 * twin has not been run), the section shows a "run the SQL" state
 * instead of failing — the rest of the course page keeps working.
 */
export default function CourseBatchesClient({ courseId, instructors, enrollments, studentMap }: CourseBatchesClientProps) {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [missingTable, setMissingTable] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  // Create form
  const [batchNumber, setBatchNumber] = useState('');
  const [status, setStatus] = useState<BatchStatus>('upcoming');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [capacity, setCapacity] = useState('');
  const [instructorId, setInstructorId] = useState('');
  // Edit form (per expanded batch)
  const [editStatus, setEditStatus] = useState<BatchStatus>('upcoming');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editCapacity, setEditCapacity] = useState('');
  const [editInstructorId, setEditInstructorId] = useState('');

  const load = async () => {
    try {
      const res = await fetch(`/api/admin/batches?courseId=${courseId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 500 with an empty/missing Batch table → "run the SQL" state.
        setMissingTable(true);
        return;
      }
      setBatches(data.batches ?? []);
      setMissingTable(false);
    } catch {
      setMissingTable(true);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/admin/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          batchNumber: batchNumber.trim() ? Number(batchNumber) : undefined,
          status,
          startDate: startDate || null,
          endDate: endDate || null,
          capacity: capacity.trim() ? Number(capacity) : null,
          instructorId: instructorId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Could not create the batch'); return; }
      toast.success(`Batch ${data.batch.batchNumber} created`);
      setShowCreate(false);
      setBatchNumber(''); setStartDate(''); setEndDate(''); setCapacity(''); setInstructorId('');
      setStatus('upcoming');
      await load();
      router.refresh();
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (batch: Batch) => {
    setExpandedId(expandedId === batch.id ? null : batch.id);
    setEditStatus(batch.status);
    setEditStartDate(batch.startDate ? batch.startDate.slice(0, 10) : '');
    setEditEndDate(batch.endDate ? batch.endDate.slice(0, 10) : '');
    setEditCapacity(batch.capacity ? String(batch.capacity) : '');
    setEditInstructorId(batch.instructorId ?? '');
  };

  const saveEdit = async (batch: Batch) => {
    setSavingId(batch.id);
    try {
      const res = await fetch(`/api/admin/batches/${batch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editStatus,
          startDate: editStartDate || null,
          endDate: editEndDate || null,
          capacity: editCapacity.trim() ? Number(editCapacity) : null,
          instructorId: editInstructorId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Could not update the batch'); return; }
      toast.success(`Batch ${batch.batchNumber} updated`);
      await load();
      router.refresh();
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (batch: Batch) => {
    if (!window.confirm(`Delete Batch ${batch.batchNumber}? This is refused when students are enrolled in it.`)) return;
    setSavingId(batch.id);
    try {
      const res = await fetch(`/api/admin/batches/${batch.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Could not delete the batch'); return; }
      toast.success(`Batch ${batch.batchNumber} deleted`);
      setExpandedId(null);
      await load();
      router.refresh();
    } finally {
      setSavingId(null);
    }
  };

  const issueCertificate = async (enrollment: Enrollment, batch: Batch) => {
    setIssuingId(enrollment.id);
    try {
      const res = await fetch('/api/admin/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: enrollment.studentId,
          courseId: enrollment.courseId,
          enrollmentId: enrollment.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Could not issue the certificate'); return; }
      toast.success(`Certificate ${data.certificate.certificateNumber} issued for Batch ${batch.batchNumber}`);
      router.refresh();
    } finally {
      setIssuingId(null);
    }
  };

  if (!loaded) {
    return (
      <FadeIn delay={0.05}>
        <Card><p className="text-muted text-sm">Loading batches…</p></Card>
      </FadeIn>
    );
  }

  if (missingTable) {
    return (
      <FadeIn delay={0.05}>
        <Card>
          <h2 className="text-foreground font-bold mb-1 text-sm">Batches</h2>
          <p className="text-muted text-sm">
            The Batch table has not been created yet — run <code className="text-primary-text">codebettle-batch-migration.sql</code> in the
            Supabase SQL Editor, then reload this page. The rest of the course keeps working without it.
          </p>
        </Card>
      </FadeIn>
    );
  }

  return (
    <FadeIn delay={0.05}>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-foreground font-bold text-sm">Batches</h2>
            <p className="text-muted text-xs mt-0.5">
              {batches.length === 0
                ? 'No batches yet — create the first one. Students enrol in the open batch; certificates take the batch number from the enrolment.'
                : 'One certificate template per course — only the batch number changes per batch.'}
            </p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(v => !v)}>{showCreate ? 'Cancel' : 'Create Batch'}</Button>
        </div>

        {showCreate && (
          <div className="bg-dark-border/20 rounded-lg p-4 mb-4 space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <Input label="Batch number (leave empty for next)" type="number" min={1} value={batchNumber} onChange={e => setBatchNumber(e.target.value)} placeholder="auto" />
              <label className="block">
                <span className="block text-xs font-medium text-muted mb-1.5">Status</span>
                <select value={status} onChange={e => setStatus(e.target.value as BatchStatus)} className="w-full px-3 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-foreground">
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <Input label="Capacity (optional)" type="number" min={1} value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="unlimited" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label="Start date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <Input label="End date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-muted mb-1.5">Instructor (optional)</span>
              <select value={instructorId} onChange={e => setInstructorId(e.target.value)} className="w-full px-3 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-foreground">
                <option value="">— course instructor —</option>
                {instructors.map(i => (
                  <option key={i.id} value={i.id}>{i.name} ({i.email})</option>
                ))}
              </select>
            </label>
            <Button size="sm" onClick={create} loading={creating}>Create Batch</Button>
          </div>
        )}

        {batches.length === 0 ? (
          <p className="text-muted text-sm text-center py-4">No batches for this course yet.</p>
        ) : (
          <div className="space-y-2">
            {batches.map(batch => {
              const batchEnrollments = enrollments.filter(e => e.batchId === batch.id);
              const expanded = expandedId === batch.id;
              return (
                <div key={batch.id} className="bg-dark-border/20 rounded-lg overflow-hidden">
                  <button onClick={() => openEdit(batch)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-border/30 transition-colors cursor-pointer text-left">
                    <span className="font-semibold text-foreground text-sm">Batch {batch.batchNumber}</span>
                    <Badge variant={batch.status === 'ongoing' ? 'success' : batch.status === 'upcoming' ? 'info' : 'danger'}>
                      {STATUS_LABELS[batch.status]}
                    </Badge>
                    {batch.startDate && <span className="text-xs text-muted">Starts {formatDate(batch.startDate)}</span>}
                    {batch.endDate && <span className="text-xs text-muted">Ends {formatDate(batch.endDate)}</span>}
                    {batch.capacity && <span className="text-xs text-muted">Capacity {batch.capacity}</span>}
                    <span className="text-xs text-muted ml-auto">{batch.enrolledCount ?? batchEnrollments.length} enrolled</span>
                  </button>
                  {expanded && (
                    <div className="border-t border-dark-border px-4 py-4 space-y-4">
                      <div className="grid sm:grid-cols-3 gap-3">
                        <label className="block">
                          <span className="block text-xs font-medium text-muted mb-1.5">Status</span>
                          <select value={editStatus} onChange={e => setEditStatus(e.target.value as BatchStatus)} className="w-full px-3 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-foreground">
                            <option value="upcoming">Upcoming</option>
                            <option value="ongoing">Ongoing</option>
                            <option value="completed">Completed</option>
                          </select>
                        </label>
                        <Input label="Start date" type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
                        <Input label="End date" type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <Input label="Capacity (empty = unlimited)" type="number" min={1} value={editCapacity} onChange={e => setEditCapacity(e.target.value)} />
                        <label className="block">
                          <span className="block text-xs font-medium text-muted mb-1.5">Instructor</span>
                          <select value={editInstructorId} onChange={e => setEditInstructorId(e.target.value)} className="w-full px-3 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-foreground">
                            <option value="">— course instructor —</option>
                            {instructors.map(i => (
                              <option key={i.id} value={i.id}>{i.name} ({i.email})</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(batch)} loading={savingId === batch.id}>Save Batch</Button>
                        <Button size="sm" variant="secondary" onClick={() => remove(batch)} loading={savingId === batch.id}>Delete Batch</Button>
                      </div>

                      {/* Batch detail: enrolled students + payment status + issue certificates. */}
                      <div>
                        <h3 className="text-foreground font-semibold text-sm mb-2">Students in Batch {batch.batchNumber}</h3>
                        {batchEnrollments.length === 0 ? (
                          <p className="text-muted text-sm">No students enrolled in this batch yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {batchEnrollments.map(enr => {
                              const student = studentMap[enr.studentId];
                              return (
                                <div key={enr.id} className="flex items-center gap-3 py-2 border-b border-dark-border/40 last:border-0">
                                  <img src={student?.avatar || ''} alt={student?.name} className="w-8 h-8 rounded-full" />
                                  <div className="flex-1">
                                    <p className="text-foreground text-sm font-medium">{student?.name}</p>
                                    <p className="text-muted text-xs">{student?.email}</p>
                                  </div>
                                  <Badge variant={enr.paymentStatus === 'paid' ? 'success' : enr.paymentStatus === 'free' ? 'info' : 'warning'}>
                                    {enr.paymentStatus}
                                  </Badge>
                                  {enr.isCompleted && (
                                    <Button size="sm" variant="outline" onClick={() => issueCertificate(enr, batch)} loading={issuingId === enr.id}>
                                      Issue Certificate
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </FadeIn>
  );
}
