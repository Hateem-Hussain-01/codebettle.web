'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import FadeIn from '@/components/ui/FadeIn';
import { Search, Plus, Upload, Trash2, Ban, CheckCircle, Eye, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

interface SafeStudent {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  bio?: string;
  status: 'active' | 'suspended';
  joinedAt: string;
  enrolledCourses?: string[];
}

interface StudentEnrollment {
  id: string;
  courseId: string;
  courseTitle: string;
  enrolledAt: string;
  completedLessons: string[];
  isCompleted: boolean;
}

interface StudentCertificate {
  id: string;
  courseId: string;
  courseTitle: string;
  certificateNumber: string;
  issuedAt: string;
}

interface StudentDetail {
  enrollments: StudentEnrollment[];
  certificates: StudentCertificate[];
}

type StatusFilter = 'all' | 'active' | 'suspended';

const PAGE_LIMITS = [10, 25, 50];

/**
 * Admin Students — backed by real API routes (/api/admin/users).
 * No user data is imported into this client component, so no password
 * hash ever reaches the browser bundle from this page.
 * Pagination (page/limit) is server-side via the extended GET; search and
 * the status filter run over the loaded page, as before.
 */
export default function AdminStudentsPage() {
  const [students, setStudents] = useState<SafeStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<SafeStudent | null>(null);
  const [viewTarget, setViewTarget] = useState<SafeStudent | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', email: '', password: '' });
  const [editTarget, setEditTarget] = useState<SafeStudent | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', bio: '' });
  const [editSaving, setEditSaving] = useState(false);

  const loadStudents = async (pageToLoad: number, limitToLoad: number) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/admin/users?page=${pageToLoad}&limit=${limitToLoad}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load students');
      setStudents(data.users);
      setPage(data.page ?? pageToLoad);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? data.users.length);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  // Mount-time data fetch for this client page (the standard fetch-on-mount
  // pattern: loading -> loaded is the intended transition, not a render
  // cascade). The React 19 use()+Suspense rewrite is a Phase 3 polish.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadStudents(1, 10);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Student detail (enrolments + certificates) loads when the view modal opens.
  useEffect(() => {
    if (!viewTarget) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    fetch(`/api/admin/users/${viewTarget.id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load student details');
        if (!cancelled) setDetail({ enrollments: data.enrollments, certificates: data.certificates });
      })
      .catch(() => { if (!cancelled) setDetail({ enrollments: [], certificates: [] }); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [viewTarget]);

  const filtered = students.filter(s =>
    (statusFilter === 'all' || s.status === statusFilter) &&
    (s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase())),
  );

  const changePage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    if (clamped !== page) loadStudents(clamped, limit);
  };

  const changeLimit = (next: number) => {
    setLimit(next);
    loadStudents(1, next);
  };

  const toggleStatus = async (student: SafeStudent) => {
    const next = student.status === 'active' ? 'suspended' : 'active';
    const res = await fetch(`/api/admin/users/${student.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Could not update status'); return; }
    setStudents(ss => ss.map(s => s.id === student.id ? { ...s, status: next } : s));
    toast.success(next === 'suspended' ? 'Student suspended and signed out everywhere' : 'Student activated');
  };

  const deleteStudent = async (id: string) => {
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Could not delete student'); return; }
    setStudents(ss => ss.filter(s => s.id !== id));
    setDeleteTarget(null);
    toast.success('Student deleted');
  };

  const createStudent = async () => {
    if (!newForm.name || !newForm.email || !newForm.password) { toast.error('All fields required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newForm, role: 'student' }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not create student'); return; }
      setStudents(ss => [data.user, ...ss]);
      setTotal(t => t + 1);
      setIsCreateOpen(false);
      setNewForm({ name: '', email: '', password: '' });
      toast.success('Student account created!');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (student: SafeStudent) => {
    setEditTarget(student);
    setEditForm({ name: student.name, email: student.email, phone: student.phone ?? '', bio: student.bio ?? '' });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editForm.name.trim() || !editForm.email.trim()) { toast.error('Name and email are required'); return; }
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          email: editForm.email.trim(),
          phone: editForm.phone.trim() || null,
          bio: editForm.bio.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not update student'); return; }
      setStudents(ss => ss.map(s => s.id === editTarget.id ? { ...s, ...data.user } : s));
      setEditTarget(null);
      toast.success('Student details updated');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Students</h1>
          <p className="text-muted text-sm mt-1">{total} total • {students.filter(s => s.status === 'active').length} active on this page</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/students/import">
            <Button variant="secondary"><Upload className="w-4 h-4" />Import CSV</Button>
          </Link>
          <Button onClick={() => setIsCreateOpen(true)}><Plus className="w-4 h-4" />Create Student</Button>
        </div>
      </FadeIn>

      <FadeIn delay={0.05} className="flex items-center gap-3 flex-wrap">
        <Input placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} className="max-w-sm" />
        <div className="flex gap-1 bg-dark-card border border-dark-border rounded-lg p-1">
          {(['all', 'active', 'suspended'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize cursor-pointer transition-colors ${statusFilter === f ? 'bg-primary text-black' : 'text-muted hover:text-foreground'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </FadeIn>

      {loading && <p className="text-muted text-sm">Loading students…</p>}
      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          {loadError} <button onClick={() => loadStudents(page, limit)} className="underline cursor-pointer ml-2">Retry</button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <FadeIn delay={0.08} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border bg-dark-border/20">
                    {['Student', 'Email', 'Joined', 'Courses', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="py-8 px-4 text-center text-muted text-sm">No students found.</td></tr>
                  )}
                  {filtered.map(student => (
                    <tr key={student.id} className="border-b border-dark-border/40 last:border-0 hover:bg-dark-border/10 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <img src={student.avatar || ''} alt={student.name} className="w-8 h-8 rounded-full" />
                          <span className="text-foreground text-xs font-medium">{student.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted text-xs">{student.email}</td>
                      <td className="py-3 px-4 text-muted text-xs">{formatDateShort(student.joinedAt)}</td>
                      <td className="py-3 px-4 text-muted text-xs">{student.enrolledCourses?.length || 0}</td>
                      <td className="py-3 px-4">
                        <Badge variant={student.status === 'active' ? 'success' : 'danger'}>{student.status}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setViewTarget(student)} className="text-muted hover:text-primary-text transition-colors p-1 cursor-pointer"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => openEdit(student)} className="text-muted hover:text-primary-text transition-colors p-1 cursor-pointer"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => toggleStatus(student)} className={`p-1 cursor-pointer transition-colors ${student.status === 'active' ? 'text-muted hover:text-yellow-400' : 'text-muted hover:text-green-400'}`}>
                            {student.status === 'active' ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                          </button>
                          <button onClick={() => setDeleteTarget(student)} className="text-muted hover:text-red-400 transition-colors p-1 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FadeIn>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-muted text-xs">
              <span>Show</span>
              <select
                value={limit}
                onChange={e => changeLimit(Number(e.target.value))}
                className="bg-dark-card border border-dark-border rounded-lg px-2 py-1.5 text-foreground text-xs cursor-pointer"
              >
                {PAGE_LIMITS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>per page</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => changePage(page - 1)} disabled={page <= 1}><ChevronLeft className="w-4 h-4" />Prev</Button>
              <span className="text-muted text-xs">Page {page} of {totalPages}</span>
              <Button size="sm" variant="secondary" onClick={() => changePage(page + 1)} disabled={page >= totalPages}>Next<ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        </>
      )}

      {/* View Modal */}
      <Modal isOpen={!!viewTarget} onClose={() => setViewTarget(null)} title="Student Details">
        {viewTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <img src={viewTarget.avatar || ''} alt={viewTarget.name} className="w-16 h-16 rounded-full border-2 border-primary/30" />
              <div>
                <p className="text-foreground font-bold">{viewTarget.name}</p>
                <p className="text-muted text-sm">{viewTarget.email}</p>
                <Badge variant={viewTarget.status === 'active' ? 'success' : 'danger'} className="mt-1">{viewTarget.status}</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted text-xs">Joined</p><p className="text-foreground">{formatDateShort(viewTarget.joinedAt)}</p></div>
              <div><p className="text-muted text-xs">Enrolled Courses</p><p className="text-foreground">{viewTarget.enrolledCourses?.length || 0}</p></div>
              {viewTarget.phone && <div><p className="text-muted text-xs">Phone</p><p className="text-foreground">{viewTarget.phone}</p></div>}
              {viewTarget.bio && <div className="col-span-2"><p className="text-muted text-xs">Bio</p><p className="text-foreground">{viewTarget.bio}</p></div>}
            </div>

            <div>
              <p className="text-foreground font-semibold text-sm mb-2">Enrolments</p>
              {detailLoading && <p className="text-muted text-xs">Loading enrolments…</p>}
              {!detailLoading && detail && detail.enrollments.length === 0 && <p className="text-muted text-xs">No enrolments yet.</p>}
              {!detailLoading && detail && detail.enrollments.length > 0 && (
                <ul className="space-y-2">
                  {detail.enrollments.map(e => (
                    <li key={e.id} className="flex items-center justify-between gap-3 bg-dark-border/20 rounded-lg px-3 py-2 text-xs">
                      <span className="text-foreground font-medium">{e.courseTitle}</span>
                      <span className="text-muted">{e.completedLessons.length} lessons done</span>
                      <Badge variant={e.isCompleted ? 'success' : 'warning'}>{e.isCompleted ? 'Completed' : 'In progress'}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="text-foreground font-semibold text-sm mb-2">Certificates</p>
              {detailLoading && <p className="text-muted text-xs">Loading certificates…</p>}
              {!detailLoading && detail && detail.certificates.length === 0 && <p className="text-muted text-xs">No certificates yet.</p>}
              {!detailLoading && detail && detail.certificates.length > 0 && (
                <ul className="space-y-2">
                  {detail.certificates.map(c => (
                    <li key={c.id} className="flex items-center justify-between gap-3 bg-dark-border/20 rounded-lg px-3 py-2 text-xs">
                      <span className="text-foreground font-medium">{c.courseTitle}</span>
                      <span className="text-muted">{c.certificateNumber}</span>
                      <span className="text-muted">{formatDateShort(c.issuedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button variant="secondary" fullWidth onClick={() => setViewTarget(null)}>Close</Button>
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Student Details">
        {editTarget && (
          <div className="space-y-4">
            <Input label="Full Name" placeholder="Student name" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            <Input label="Email" type="email" placeholder="student@email.com" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            <Input label="Phone" placeholder="Phone number" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            <Textarea label="Bio" placeholder="Short bio" value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={3} />
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button fullWidth onClick={saveEdit} loading={editSaving}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Student Account">
        <div className="space-y-4">
          <Input label="Full Name" placeholder="Student name" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Email" type="email" placeholder="student@email.com" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} />
          <Input label="Password" type="password" placeholder="Min. 8 characters" value={newForm.password} onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))} />
          <p className="text-muted text-xs">The password is hashed on the server before it is stored.</p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button fullWidth onClick={createStudent} loading={saving}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Student" size="sm">
        <p className="text-muted text-sm mb-2">Delete <span className="text-foreground font-medium">{deleteTarget?.name}</span>?</p>
        <p className="text-muted text-xs mb-6">This will permanently remove their account and all enrollment data.</p>
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={() => deleteStudent(deleteTarget!.id)}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
