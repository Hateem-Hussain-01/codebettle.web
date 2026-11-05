'use client';
import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { UserCheck, Check, X } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Application {
  id: string;
  name: string;
  email: string;
  expertise: string;
  experience: string;
  message: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

const MOCK_APPLICATIONS: Application[] = [
  { id: '1', name: 'Rahim Khan', email: 'rahim@gmail.com', expertise: 'React, Node.js, MongoDB', experience: '6 years as full-stack developer', message: 'I want to share my knowledge with students in Pakistan. I have taught at local institutes before.', submittedAt: '2024-05-20', status: 'pending' },
  { id: '2', name: 'Sidra Ali', email: 'sidra@gmail.com', expertise: 'Python, Data Science, ML', experience: '4 years as data scientist at tech startup', message: 'Passionate about teaching data science. I have mentored 15+ students.', submittedAt: '2024-05-25', status: 'pending' },
  { id: '3', name: 'Adeel Chaudhry', email: 'adeel@gmail.com', expertise: 'Flutter, Firebase', experience: '3 years mobile developer', message: 'Want to teach mobile development to aspiring devs.', submittedAt: '2024-05-28', status: 'pending' },
  { id: '4', name: 'Mariam Iqbal', email: 'mariam@gmail.com', expertise: 'UI/UX, Figma, CSS', experience: '5 years UI/UX designer at agency', message: 'I believe good design makes the world better. Want to teach it.', submittedAt: '2024-05-30', status: 'approved' },
];

export default function AdminApplicationsPage() {
  const [apps, setApps] = useState(MOCK_APPLICATIONS);

  const handleAction = (id: string, status: 'approved' | 'rejected') => {
    setApps(a => a.map(app => app.id === id ? { ...app, status } : app));
    toast.success(`Application ${status}!`);
  };

  const pending = apps.filter(a => a.status === 'pending');
  const reviewed = apps.filter(a => a.status !== 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Instructor Applications</h1>
        <p className="text-muted text-sm mt-1">{pending.length} pending · {apps.filter(a => a.status === 'approved').length} approved</p>
      </div>

      {pending.length > 0 && (
        <div>
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2"><UserCheck className="w-4 h-4 text-primary" />Pending Review ({pending.length})</h2>
          <div className="space-y-4">
            {pending.map(app => (
              <Card key={app.id} hover>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">{app.name.charAt(0)}</div>
                      <div>
                        <p className="text-white font-semibold text-sm">{app.name}</p>
                        <p className="text-muted text-xs">{app.email}</p>
                      </div>
                    </div>
                    <p className="text-muted text-xs mb-1"><span className="text-white">Expertise:</span> {app.expertise}</p>
                    <p className="text-muted text-xs mb-2"><span className="text-white">Experience:</span> {app.experience}</p>
                    <p className="text-muted text-xs italic">"{app.message}"</p>
                    <p className="text-muted text-xs mt-2">Submitted {formatDateShort(app.submittedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="danger" onClick={() => handleAction(app.id, 'rejected')}><X className="w-3.5 h-3.5" />Reject</Button>
                    <Button size="sm" onClick={() => handleAction(app.id, 'approved')}><Check className="w-3.5 h-3.5" />Approve</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {reviewed.length > 0 && (
        <div>
          <h2 className="text-white font-semibold mb-3">Reviewed ({reviewed.length})</h2>
          <div className="space-y-3">
            {reviewed.map(app => (
              <Card key={app.id} className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-dark-border text-muted flex items-center justify-center font-bold text-sm">{app.name.charAt(0)}</div>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{app.name}</p>
                  <p className="text-muted text-xs">{app.email} · {app.expertise}</p>
                </div>
                <Badge variant={app.status === 'approved' ? 'success' : 'danger'}>{app.status}</Badge>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
