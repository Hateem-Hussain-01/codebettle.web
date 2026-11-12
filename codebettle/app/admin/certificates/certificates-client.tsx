'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import FadeIn from '@/components/ui/FadeIn';
import { Award, Plus } from 'lucide-react';
import { formatDate, formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Certificate, Course, Enrollment, SafeUser } from '@/lib/db/types';

interface CertificatesClientProps {
  students: SafeUser[];
  courses: Course[];
  eligibleEnrollments: Enrollment[];
}

/**
 * Admin certificates — wired to /api/admin/certificates (Phase 3).
 * The list is fetched page by page (25 per page by default). Issuing a
 * certificate posts student + course + enrolment; the enrolment picker
 * only offers completed, certificate-free enrolments, and leaving the
 * certificate number blank lets the server auto-generate CB-<year>-<seq>.
 */
export default function CertificatesClient({ students, courses, eligibleEnrollments: initialEligible }: CertificatesClientProps) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [eligibleEnrollments, setEligibleEnrollments] = useState(initialEligible);
  const [issueForm, setIssueForm] = useState({ studentId: '', courseId: '', enrollmentId: '', certificateNumber: '', batch: '' });

  const studentMap = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const courseMap = useMemo(() => Object.fromEntries(courses.map(c => [c.id, c])), [courses]);

  const loadCertificates = useCallback(async (p: number, l: number) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/admin/certificates?page=${p}&limit=${l}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load certificates');
      setCertificates(data.certificates);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load certificates');
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { loadCertificates(page, limit); }, [page, limit, loadCertificates]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Issue form: course options follow the chosen student, enrolment options
  // follow the chosen student + course (completed, certificate-free only).
  const eligibleCourses = useMemo(() => {
    if (!issueForm.studentId) return [];
    const courseIds = [...new Set(eligibleEnrollments.filter(e => e.studentId === issueForm.studentId).map(e => e.courseId))];
    return courseIds.map(id => courseMap[id]).filter(Boolean);
  }, [issueForm.studentId, eligibleEnrollments, courseMap]);

  const eligibleForSelection = useMemo(
    () => eligibleEnrollments.filter(e => e.studentId === issueForm.studentId && e.courseId === issueForm.courseId),
    [issueForm.studentId, issueForm.courseId, eligibleEnrollments],
  );

  const issueCertificate = async () => {
    if (!issueForm.enrollmentId) { toast.error('Choose an enrollment'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: issueForm.studentId,
          courseId: issueForm.courseId,
          enrollmentId: issueForm.enrollmentId,
          certificateNumber: issueForm.certificateNumber.trim() || undefined,
          batch: issueForm.batch.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not issue certificate'); return; }
      setCertificates(cs => [data.certificate as Certificate, ...cs]);
      setEligibleEnrollments(es => es.filter(e => e.id !== issueForm.enrollmentId));
      setTotal(t => t + 1);
      setIsIssueOpen(false);
      setIssueForm({ studentId: '', courseId: '', enrollmentId: '', certificateNumber: '', batch: '' });
      toast.success(`Certificate issued: ${(data.certificate as Certificate).certificateNumber}`);
    } finally {
      setSaving(false);
    }
  };

  // Revoke (Phase 2): two-step confirm — the first click arms the
  // button, the second calls POST /api/admin/certificates/[id]/revoke.
  // Revoking is permanent (no un-revoke); the verify page then shows
  // the certificate as revoked/invalid.
  const revokeCertificate = async (id: string) => {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/admin/certificates/${id}/revoke`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not revoke certificate'); return; }
      setCertificates(cs => cs.map(c => (c.id === id ? (data.certificate as Certificate) : c)));
      setConfirmRevokeId(null);
      toast.success(`Certificate revoked: ${(data.certificate as Certificate).certificateNumber}`);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Certificates</h1>
          <p className="text-muted text-sm mt-1">{total} certificates issued</p>
        </div>
        <Button onClick={() => setIsIssueOpen(true)}><Plus className="w-4 h-4" />Issue Certificate</Button>
      </FadeIn>

      {loading && <p className="text-muted text-sm">Loading certificates…</p>}
      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          {loadError} <button onClick={() => loadCertificates(page, limit)} className="underline cursor-pointer ml-2">Retry</button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <FadeIn delay={0.08} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border bg-dark-border/20">
                    {['Certificate No', 'Student', 'Course', 'Issued Date', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {certificates.length === 0 && (
                    <tr><td colSpan={6} className="py-8 px-4 text-center text-muted text-sm">No certificates issued yet.</td></tr>
                  )}
                  {certificates.map(cert => {
                    const student = studentMap[cert.studentId];
                    const course = courseMap[cert.courseId];
                    return (
                      <tr key={cert.id} className="border-b border-dark-border/40 last:border-0 hover:bg-dark-border/10">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-primary-text" />
                            <span className="text-primary-text font-mono text-xs font-bold">{cert.certificateNumber}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <img src={student?.avatar || ''} alt={student?.name} className="w-7 h-7 rounded-full" />
                            <span className="text-foreground text-xs">{student?.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted text-xs max-w-[160px] truncate">{course?.title}</td>
                        <td className="py-3 px-4 text-muted text-xs">{formatDate(cert.issuedAt)}</td>
                        <td className="py-3 px-4">
                          {cert.revokedAt ? (
                            <Badge variant="warning">Revoked{cert.revokedAt ? ` ${formatDate(cert.revokedAt)}` : ''}</Badge>
                          ) : (
                            <Badge variant="success">Valid</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {cert.revokedAt ? (
                            <span className="text-muted text-xs">—</span>
                          ) : confirmRevokeId === cert.id ? (
                            <span className="flex items-center gap-2">
                              <Button size="sm" variant="danger" loading={revokingId === cert.id} onClick={() => revokeCertificate(cert.id)}>Confirm revoke</Button>
                              <Button size="sm" variant="secondary" onClick={() => setConfirmRevokeId(null)}>Cancel</Button>
                            </span>
                          ) : (
                            <Button size="sm" variant="secondary" onClick={() => setConfirmRevokeId(cert.id)}>Revoke</Button>
                          )}
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

      {/* Issue Modal */}
      <Modal isOpen={isIssueOpen} onClose={() => setIsIssueOpen(false)} title="Issue Certificate">
        <div className="space-y-4">
          <Select
            label="Student *"
            value={issueForm.studentId}
            onChange={e => setIssueForm({ studentId: e.target.value, courseId: '', enrollmentId: '', certificateNumber: issueForm.certificateNumber, batch: '' })}
            options={[
              { value: '', label: 'Select a student' },
              ...[...new Set(eligibleEnrollments.map(e => e.studentId))].map(id => ({
                value: id,
                label: `${studentMap[id]?.name ?? 'Student'} (${studentMap[id]?.email ?? ''})`,
              })),
            ]}
          />
          <Select
            label="Course *"
            value={issueForm.courseId}
            onChange={e => setIssueForm(f => ({ ...f, courseId: e.target.value, enrollmentId: '' }))}
            options={[
              { value: '', label: issueForm.studentId ? 'Select a course' : 'Select a student first' },
              ...eligibleCourses.map(c => ({ value: c.id, label: c.title })),
            ]}
          />
          <Select
            label="Enrollment *"
            value={issueForm.enrollmentId}
            onChange={e => setIssueForm(f => ({ ...f, enrollmentId: e.target.value }))}
            options={[
              { value: '', label: issueForm.courseId ? 'Select an enrollment' : 'Select a course first' },
              ...eligibleForSelection.map(e => ({
                value: e.id,
                label: `${courseMap[e.courseId]?.title ?? 'Course'} — completed ${formatDateShort(e.completedAt ?? e.enrolledAt)}`,
              })),
            ]}
          />
          <Input
            label="Certificate Number (optional)"
            placeholder="Leave blank to auto-generate"
            value={issueForm.certificateNumber}
            onChange={e => setIssueForm(f => ({ ...f, certificateNumber: e.target.value }))}
          />
          <Input
            label="Batch (optional)"
            placeholder="e.g. BATCH-8 — leave blank for the course default"
            value={issueForm.batch}
            onChange={e => setIssueForm(f => ({ ...f, batch: e.target.value }))}
          />
          <p className="text-muted text-xs">Only completed enrollments without a certificate are listed. The number is auto-generated as CB-&lt;year&gt;-&lt;seq&gt; when left blank.</p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsIssueOpen(false)}>Cancel</Button>
            <Button fullWidth onClick={issueCertificate} loading={saving}>Issue</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
