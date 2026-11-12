'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import FadeIn from '@/components/ui/FadeIn';
import { Search, Eye, Ban, CheckCircle, Trash2, Plus, Pencil, BookOpen } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { SafeUser } from '@/lib/db/types';
import { hasTeacherCapability } from '@/lib/rbac';

type User = SafeUser;

interface InstructorsClientProps {
  instructors: SafeUser[];
  courseCounts: Record<string, number>;
  coursesByInstructor: Record<string, { id: string; title: string }[]>;
  allCourses: { id: string; title: string; instructorId: string }[];
}

/**
 * Admin instructors — wired to the real admin user APIs (Phase 3):
 * POST /api/admin/users (role 'instructor') to create, PUT to edit
 * (incl. bio/expertise), PATCH to suspend/activate, DELETE to remove.
 * Course counts and courses taught come from the server wrapper as props.
 */
export default function InstructorsClient({ instructors: allInstructors, courseCounts: initialCounts, coursesByInstructor: initialByInstructor, allCourses: initialCourses }: InstructorsClientProps) {
  // Phase 2: teacher capability (isTeacher flag or legacy primary role), not the primary role alone.
  const initialInstructors = allInstructors.filter((u) => hasTeacherCapability(u));
  const [instructors, setInstructors] = useState(initialInstructors);
  // Live copies of the server-passed maps: assigning a course updates the
  // per-instructor count and list without a page reload.
  const [courseCounts, setCourseCounts] = useState(initialCounts);
  const [coursesByInstructor, setCoursesByInstructor] = useState(initialByInstructor);
  const [courses, setCourses] = useState(initialCourses);
  const [search, setSearch] = useState('');
  const [viewTarget, setViewTarget] = useState<User | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assignTarget, setAssignTarget] = useState<User | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [newForm, setNewForm] = useState({ name: '', email: '', password: '' });
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', bio: '', expertise: '' });
  const [editSaving, setEditSaving] = useState(false);

  const filtered = instructors.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.email.toLowerCase().includes(search.toLowerCase()));

  const createInstructor = async () => {
    if (!newForm.name || !newForm.email || !newForm.password) { toast.error('All fields required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newForm, role: 'instructor' }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not create instructor'); return; }
      setInstructors(is => [data.user, ...is]);
      setIsCreateOpen(false);
      setNewForm({ name: '', email: '', password: '' });
      toast.success('Instructor account created!');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (inst: User) => {
    setEditTarget(inst);
    setEditForm({
      name: inst.name,
      email: inst.email,
      phone: inst.phone ?? '',
      bio: inst.bio ?? '',
      expertise: (inst.expertise ?? []).join(', '),
    });
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
          expertise: editForm.expertise.split(',').map(e => e.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not update instructor'); return; }
      setInstructors(is => is.map(i => i.id === editTarget.id ? { ...i, ...data.user } : i));
      setEditTarget(null);
      toast.success('Instructor updated');
    } finally {
      setEditSaving(false);
    }
  };

  const toggleStatus = async (inst: User) => {
    const next = inst.status === 'active' ? 'suspended' : 'active';
    const res = await fetch(`/api/admin/users/${inst.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Could not update status'); return; }
    setInstructors(is => is.map(i => i.id === inst.id ? { ...i, status: next } : i));
    toast.success(next === 'suspended' ? 'Instructor suspended and signed out everywhere' : 'Instructor activated');
  };

  const removeInstructor = async (id: string) => {
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Could not remove instructor'); return; }
    setInstructors(is => is.filter(i => i.id !== id));
    setDeleteTarget(null);
    toast.success('Instructor removed');
  };

  /**
   * Admin-assisted view-as: open the teacher's actual Teacher Portal,
   * view-only. No time limit — the session lasts until the admin
   * clicks Exit in the banner, signs out, or closes the browser.
   * Suspended teachers never get the button (the service refuses
   * them), so this only ever fires for active accounts.
   */
  const handleSwitchToTeacherPortal = async (teacherId: string) => {
    setSwitchingId(teacherId);
    try {
      const res = await fetch('/api/admin/view-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not open the teacher portal'); return; }
      window.location.href = '/instructor/dashboard';
    } finally {
      setSwitchingId(null);
    }
  };

  /**
   * Assign a course to the instructor picked in the "Assign Course" modal.
   * PATCHes { instructorId } to the existing /api/admin/courses/[id]
   * endpoint — the same one the course detail page uses. One instructor
   * may teach many courses, so this never un-assigns their other courses;
   * if the course belonged to someone else, it moves (their count drops).
   */
  const assignCourse = async (course: { id: string; title: string; instructorId: string }) => {
    if (!assignTarget) return;
    const target = assignTarget;
    const previousInstructorId = course.instructorId;
    setAssigningId(course.id);
    try {
      const res = await fetch(`/api/admin/courses/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructorId: target.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Could not assign course'); return; }
      setCourses(cs => cs.map(c => c.id === course.id ? { ...c, instructorId: target.id } : c));
      setCoursesByInstructor(prev => {
        const next: Record<string, { id: string; title: string }[]> = {};
        for (const [k, v] of Object.entries(prev)) next[k] = v.filter(c => c.id !== course.id);
        next[target.id] = [...(next[target.id] ?? []), { id: course.id, title: course.title }];
        return next;
      });
      setCourseCounts(prev => {
        const next = { ...prev };
        if (previousInstructorId && previousInstructorId !== target.id) {
          next[previousInstructorId] = Math.max(0, (next[previousInstructorId] ?? 0) - 1);
        }
        next[target.id] = (next[target.id] ?? 0) + 1;
        return next;
      });
      toast.success(`"${course.title}" assigned to ${target.name}`);
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Instructors</h1>
          <p className="text-muted text-sm mt-1">{instructors.length} instructor{instructors.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}><Plus className="w-4 h-4" />Add Instructor</Button>
      </FadeIn>

      <Input placeholder="Search instructors..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} className="max-w-sm" />

      {filtered.length === 0 && <p className="text-muted text-sm">No instructors found.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((inst, i) => {
          const courseCount = courseCounts[inst.id] ?? 0;
          return (
            <FadeIn key={inst.id} delay={Math.min(i % 3, 2) * 0.07} className="bg-dark-card border border-dark-border rounded-xl p-5 hover:border-primary/30 transition-all">
              <div className="flex items-start gap-3 mb-3">
                <img src={inst.avatar || ''} alt={inst.name} className="w-12 h-12 rounded-full border-2 border-primary/20" />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-semibold text-sm">{inst.name}</p>
                  <p className="text-muted text-xs truncate">{inst.email}</p>
                  <Badge variant={inst.status === 'active' ? 'success' : 'danger'} className="mt-1">{inst.status}</Badge>
                </div>
              </div>
              {inst.expertise && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {inst.expertise.slice(0, 3).map(e => <span key={e} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-text">{e}</span>)}
                </div>
              )}
              <p className="text-muted text-xs mb-4">{courseCount} course{courseCount !== 1 ? 's' : ''} • Joined {formatDateShort(inst.joinedAt)}</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" className="flex-1" onClick={() => setViewTarget(inst)}><Eye className="w-3.5 h-3.5" />View</Button>
                <button onClick={() => openEdit(inst)} className="p-2 rounded-lg border border-dark-border text-muted hover:text-primary-text hover:border-primary/30 transition-all cursor-pointer">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => toggleStatus(inst)} className={`p-2 rounded-lg border transition-all cursor-pointer ${inst.status === 'active' ? 'border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10' : 'border-green-500/30 text-green-400 hover:bg-green-500/10'}`}>
                  {inst.status === 'active' ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                </button>
                <button onClick={() => setDeleteTarget(inst)} className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <Button size="sm" variant="secondary" fullWidth className="mt-2" onClick={() => setAssignTarget(inst)}>
                <BookOpen className="w-3.5 h-3.5" />Assign Course
              </Button>
              {inst.status === 'active' && (
                <Button size="sm" variant="secondary" fullWidth className="mt-2" onClick={() => handleSwitchToTeacherPortal(inst.id)} loading={switchingId === inst.id}>
                  <Eye className="w-3.5 h-3.5" />Switch to Teacher Portal
                </Button>
              )}
            </FadeIn>
          );
        })}
      </div>

      <Modal isOpen={!!viewTarget} onClose={() => setViewTarget(null)} title="Instructor Profile">
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
            {viewTarget.bio && <p className="text-muted text-sm">{viewTarget.bio}</p>}
            {viewTarget.expertise && (
              <div className="flex flex-wrap gap-1.5">
                {viewTarget.expertise.map(e => <span key={e} className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary-text border border-primary/20">{e}</span>)}
              </div>
            )}
            <div>
              <p className="text-foreground font-semibold text-sm mb-2">Courses Taught</p>
              {(coursesByInstructor[viewTarget.id] ?? []).length === 0 && (
                <p className="text-muted text-xs">No courses yet.</p>
              )}
              <ul className="space-y-2">
                {(coursesByInstructor[viewTarget.id] ?? []).map(c => (
                  <li key={c.id} className="bg-dark-border/20 rounded-lg px-3 py-2 text-xs text-foreground font-medium">{c.title}</li>
                ))}
              </ul>
            </div>
            {viewTarget.phone && <p className="text-muted text-xs">Phone: <span className="text-foreground">{viewTarget.phone}</span></p>}
            <p className="text-muted text-xs">Joined: {formatDateShort(viewTarget.joinedAt)}</p>
            <Button variant="secondary" fullWidth onClick={() => setViewTarget(null)}>Close</Button>
          </div>
        )}
      </Modal>

      {/* Assign Course Modal — pick a course to assign to this instructor.
          Courses they already teach are marked; the rest show who teaches
          them now (assigning moves the course to this instructor). */}
      <Modal isOpen={!!assignTarget} onClose={() => setAssignTarget(null)} title={assignTarget ? `Assign Course to ${assignTarget.name}` : 'Assign Course'}>
        {assignTarget && (
          <div className="space-y-2">
            <p className="text-muted text-xs mb-2">Pick a course to assign. One instructor can teach many courses, so this never removes their other courses.</p>
            {courses.length === 0 && <p className="text-muted text-sm text-center py-4">No courses yet.</p>}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {courses.map(course => {
                const alreadyAssigned = course.instructorId === assignTarget.id;
                const otherInstructor = !alreadyAssigned && course.instructorId
                  ? instructors.find(i => i.id === course.instructorId)?.name
                  : null;
                return (
                  <div key={course.id} className="flex items-center gap-3 bg-dark-border/20 rounded-lg px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground text-sm font-medium truncate">{course.title}</p>
                      {alreadyAssigned
                        ? <p className="text-muted text-xs">Already assigned to {assignTarget.name}</p>
                        : otherInstructor
                          ? <p className="text-muted text-xs">Currently taught by {otherInstructor}</p>
                          : <p className="text-muted text-xs">No instructor yet</p>}
                    </div>
                    {alreadyAssigned
                      ? <Badge variant="success">Assigned</Badge>
                      : <Button size="sm" loading={assigningId === course.id} onClick={() => assignCourse(course)}>Assign</Button>}
                  </div>
                );
              })}
            </div>
            <Button variant="secondary" fullWidth onClick={() => setAssignTarget(null)}>Done</Button>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Add Instructor">
        <div className="space-y-4">
          <Input label="Full Name" placeholder="Instructor name" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Email" type="email" placeholder="instructor@email.com" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} />
          <Input label="Password" type="password" placeholder="Min. 8 characters" value={newForm.password} onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))} />
          <p className="text-muted text-xs">The password is hashed on the server before it is stored.</p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button fullWidth onClick={createInstructor} loading={saving}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Instructor">
        {editTarget && (
          <div className="space-y-4">
            <Input label="Full Name" placeholder="Instructor name" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            <Input label="Email" type="email" placeholder="instructor@email.com" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            <Input label="Phone" placeholder="Phone number" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            <Textarea label="Bio" placeholder="Short bio" value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={3} />
            <Input label="Expertise" placeholder="React, Python, UI/UX — comma separated" value={editForm.expertise} onChange={e => setEditForm(f => ({ ...f, expertise: e.target.value }))} />
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button fullWidth onClick={saveEdit} loading={editSaving}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove Instructor" size="sm">
        <p className="text-muted text-sm mb-2">Remove <span className="text-foreground font-medium">{deleteTarget?.name}</span>?</p>
        <p className="text-muted text-xs mb-6">This will permanently remove their account. Their courses keep their references.</p>
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={() => removeInstructor(deleteTarget!.id)}>Remove</Button>
        </div>
      </Modal>
    </div>
  );
}
