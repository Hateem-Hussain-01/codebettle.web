'use client';
import { useState } from 'react';
import { users as allUsers } from '@/lib/data/users';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Textarea from '@/components/ui/Textarea';
import { Search, Plus, Trash2, Ban, CheckCircle, Eye } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

type User = (typeof allUsers)[0];

export default function AdminStudentsPage() {
  const initialStudents = allUsers.filter(u => u.role === 'student');
  const [students, setStudents] = useState(initialStudents);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [viewTarget, setViewTarget] = useState<User | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', email: '', password: '' });

  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()));

  const toggleStatus = (id: string) => {
    setStudents(ss => ss.map(s => s.id === id ? { ...s, status: s.status === 'active' ? 'suspended' : 'active' } : s));
    toast.success('Student status updated');
  };

  const deleteStudent = (id: string) => {
    setStudents(ss => ss.filter(s => s.id !== id));
    setDeleteTarget(null);
    toast.success('Student deleted');
  };

  const createStudent = () => {
    if (!newForm.name || !newForm.email || !newForm.password) { toast.error('All fields required'); return; }
    const newStudent: User = {
      id: `student-${Date.now()}`,
      name: newForm.name,
      email: newForm.email,
      password: newForm.password,
      role: 'student',
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(newForm.name)}&backgroundColor=1C1C1C&textColor=F5C518`,
      status: 'active',
      joinedAt: new Date().toISOString().split('T')[0],
      enrolledCourses: [],
      wishlist: [],
    };
    setStudents(ss => [newStudent, ...ss]);
    setIsCreateOpen(false);
    setNewForm({ name: '', email: '', password: '' });
    toast.success('Student account created!');
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
                      <button onClick={() => toggleStatus(student.id)} className={`p-1 cursor-pointer transition-colors ${student.status === 'active' ? 'text-muted hover:text-yellow-400' : 'text-muted hover:text-green-400'}`}>
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
          <Input label="Password" type="password" placeholder="Min. 6 characters" value={newForm.password} onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))} />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button fullWidth onClick={createStudent}>Create</Button>
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
