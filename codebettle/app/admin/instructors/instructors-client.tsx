'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Search, Eye, Ban, CheckCircle, Trash2 } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { SafeUser } from '@/lib/db/types';

type User = SafeUser;

interface InstructorsClientProps {
  instructors: SafeUser[];
  courseCounts: Record<string, number>;
}

export default function InstructorsClient({ instructors: allInstructors, courseCounts }: InstructorsClientProps) {
  const initialInstructors = allInstructors.filter(u => u.role === 'instructor');
  const [instructors, setInstructors] = useState(initialInstructors);
  const [search, setSearch] = useState('');
  const [viewTarget, setViewTarget] = useState<User | null>(null);

  const filtered = instructors.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.email.toLowerCase().includes(search.toLowerCase()));

  const toggleStatus = (id: string) => {
    setInstructors(is => is.map(i => i.id === id ? { ...i, status: i.status === 'active' ? 'suspended' : 'active' } : i));
    toast.success('Instructor status updated');
  };

  const removeInstructor = (id: string) => {
    setInstructors(is => is.filter(i => i.id !== id));
    toast.success('Instructor removed');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Instructors</h1>
        <p className="text-muted text-sm mt-1">{instructors.length} instructor{instructors.length !== 1 ? 's' : ''}</p>
      </div>

      <Input placeholder="Search instructors..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} className="max-w-sm" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(inst => {
          const courseCount = courseCounts[inst.id] ?? 0;
          return (
            <div key={inst.id} className="bg-dark-card border border-dark-border rounded-xl p-5 hover:border-primary/30 transition-all">
              <div className="flex items-start gap-3 mb-3">
                <img src={inst.avatar || ''} alt={inst.name} className="w-12 h-12 rounded-full border-2 border-primary/20" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{inst.name}</p>
                  <p className="text-muted text-xs truncate">{inst.email}</p>
                  <Badge variant={inst.status === 'active' ? 'success' : 'danger'} className="mt-1">{inst.status}</Badge>
                </div>
              </div>
              {inst.expertise && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {inst.expertise.slice(0, 3).map(e => <span key={e} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{e}</span>)}
                </div>
              )}
              <p className="text-muted text-xs mb-4">{courseCount} course{courseCount !== 1 ? 's' : ''} • Joined {formatDateShort(inst.joinedAt)}</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" className="flex-1" onClick={() => setViewTarget(inst)}><Eye className="w-3.5 h-3.5" />View</Button>
                <button onClick={() => toggleStatus(inst.id)} className={`p-2 rounded-lg border transition-all cursor-pointer ${inst.status === 'active' ? 'border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10' : 'border-green-500/30 text-green-400 hover:bg-green-500/10'}`}>
                  {inst.status === 'active' ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                </button>
                <button onClick={() => removeInstructor(inst.id)} className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal isOpen={!!viewTarget} onClose={() => setViewTarget(null)} title="Instructor Profile">
        {viewTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <img src={viewTarget.avatar || ''} alt={viewTarget.name} className="w-16 h-16 rounded-full border-2 border-primary/30" />
              <div>
                <p className="text-white font-bold">{viewTarget.name}</p>
                <p className="text-muted text-sm">{viewTarget.email}</p>
              </div>
            </div>
            {viewTarget.bio && <p className="text-muted text-sm">{viewTarget.bio}</p>}
            {viewTarget.expertise && (
              <div className="flex flex-wrap gap-1.5">
                {viewTarget.expertise.map(e => <span key={e} className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{e}</span>)}
              </div>
            )}
            <p className="text-muted text-xs">Joined: {formatDateShort(viewTarget.joinedAt)}</p>
            <Button variant="secondary" fullWidth onClick={() => setViewTarget(null)}>Close</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
