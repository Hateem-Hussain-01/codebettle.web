'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Search, Plus, Trash2, Ban, CheckCircle, Eye } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

interface SafeStudent {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  status: 'active' | 'suspended';
  joinedAt: string;
  enrolledCourses?: string[];
}

/**
 * Admin Students — backed by real API routes (/api/admin/users).
 * No user data is imported into this client component, so no password
 * hash ever reaches the browser bundle from this page.
 */
export default function AdminStudentsPage() {
  const [students, setStudents] = useState<SafeStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SafeStudent | null>(null);
  const [viewTarget, setViewTarget] = useState<SafeStudent | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', email: '', password: '' });

  const loadStudents = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load students');
      setStudents(data.users);
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
    loadStudents();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()));

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
      setIsCreateOpen(false);
      setNewForm({ name: '', email: '', password: '' });
      toast.success('Student account created!');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Students</h1>
          <p className="text-muted text-sm mt-1">{students.length} total • {students.filter(s => s.status === 'active').length} active</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}><Plus className="w-4 h-4" />Create Student</Button>
      </div>

      <Input placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} className="max-w-sm" />

      {loading && <p className="text-muted text-sm">Loading students…</p>}
      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          {loadError} <button onClick={loadStudents} className="underline cursor-pointer ml-2">Retry</button>
        </div>
      )}

      {!loading && !loadError && (
        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
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
                        <span className="text-white text-xs font-medium">{student.name}</span>
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
                        <button onClick={() => setViewTarget(student)} className="text-muted hover:text-primary transition-colors p-1 cursor-pointer"><Eye className="w-4 h-4" /></button>
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
        </div>
      )}

      {/* View Modal */}
      <Modal isOpen={!!viewTarget} onClose={() => setViewTarget(null)} title="Student Details">
        {viewTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <img src={viewTarget.avatar || ''} alt={viewTarget.name} className="w-16 h-16 rounded-full border-2 border-primary/30" />
              <div>
                <p className="text-white font-bold">{viewTarget.name}</p>
                <p className="text-muted text-sm">{viewTarget.email}</p>
                <Badge variant={viewTarget.status === 'active' ? 'success' : 'danger'} className="mt-1">{viewTarget.status}</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted text-xs">Joined</p><p className="text-white">{formatDateShort(viewTarget.joinedAt)}</p></div>
              <div><p className="text-muted text-xs">Enrolled Courses</p><p className="text-white">{viewTarget.enrolledCourses?.length || 0}</p></div>
            </div>
            <Button variant="secondary" fullWidth onClick={() => setViewTarget(null)}>Close</Button>
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
        <p className="text-muted text-sm mb-2">Delete <span className="text-white font-medium">{deleteTarget?.name}</span>?</p>
        <p className="text-muted text-xs mb-6">This will permanently remove their account and all enrollment data.</p>
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={() => deleteStudent(deleteTarget!.id)}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
