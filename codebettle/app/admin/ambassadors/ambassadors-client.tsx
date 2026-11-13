'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { Trash2, Users } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { AmbassadorApplication, AmbassadorApplicationStatus } from '@/lib/db/types';

interface AmbassadorsClientProps {
  initialApplications: AmbassadorApplication[];
  total: number;
  tableMissing: boolean;
}

const STATUS_LABEL: Record<AmbassadorApplicationStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_BADGE: Record<AmbassadorApplicationStatus, 'info' | 'success' | 'danger'> = {
  pending: 'info',
  approved: 'success',
  rejected: 'danger',
};

export default function AmbassadorsClient({ initialApplications, total, tableMissing }: AmbassadorsClientProps) {
  const [list, setList] = useState(initialApplications);
  const [filter, setFilter] = useState<'all' | AmbassadorApplicationStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const shown = filter === 'all' ? list : list.filter((a) => a.status === filter);
  const pendingCount = list.filter((a) => a.status === 'pending').length;

  const changeStatus = async (application: AmbassadorApplication, status: AmbassadorApplicationStatus) => {
    const res = await fetch(`/api/admin/ambassadors/${application.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error('Could not update the application');
      return;
    }
    const data = await res.json();
    setList((l) => l.map((a) => (a.id === application.id ? data.application : a)));
    toast.success(`Application ${STATUS_LABEL[status].toLowerCase()}`);
  };

  const handleDelete = async (application: AmbassadorApplication) => {
    if (!window.confirm(`Delete the ambassador application from ${application.fullName}?`)) return;
    const res = await fetch(`/api/admin/ambassadors/${application.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Could not delete the application');
      return;
    }
    setList((l) => l.filter((a) => a.id !== application.id));
    toast.success('Application deleted');
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">Ambassadors</h1>
          <p className="text-muted text-sm mt-1">
            Campus ambassador applications from /become-ambassador
            {pendingCount > 0 ? ` — ${pendingCount} pending` : ''} ({total} total)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
            <Button key={s} variant={filter === s ? 'primary' : 'outline'} size="sm" onClick={() => setFilter(s)}>
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
      </FadeIn>

      {tableMissing && (
        <Card className="border-primary/40">
          <p className="text-foreground font-medium">Ambassador applications are not set up yet</p>
          <p className="text-muted text-sm mt-1">
            Run <code className="text-primary-text">codebettle-footer-bookcall-migration.sql</code> in the Supabase SQL
            Editor first — until then applications cannot be saved and this list stays empty.
          </p>
        </Card>
      )}

      {shown.length === 0 ? (
        <Card className="py-16 text-center">
          <Users className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">No applications{filter !== 'all' ? ` — nothing ${filter}` : ' yet'}</p>
          <p className="text-muted text-sm mt-1">Applications from the /become-ambassador form will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((application, i) => {
            const expanded = expandedId === application.id;
            return (
              <FadeIn key={application.id} delay={Math.min(i, 4) * 0.05}>
                <Card className={application.status === 'pending' ? 'border-primary/30' : ''}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : application.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${application.status === 'pending' ? 'bg-primary/15 text-primary-text' : 'bg-dark-border text-muted'}`}
                      >
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-foreground font-medium text-sm">{application.fullName}</p>
                          <Badge variant={STATUS_BADGE[application.status]}>{STATUS_LABEL[application.status]}</Badge>
                          <span className="text-muted text-xs ml-auto">{formatDateShort(application.createdAt)}</span>
                        </div>
                        <p className="text-muted text-xs mt-0.5">
                          {application.email}
                          {application.whatsapp ? ` · WhatsApp ${application.whatsapp}` : ''}
                          {application.university ? ` · ${application.university}` : ''}
                          {application.departmentSemester ? ` · ${application.departmentSemester}` : ''}
                        </p>
                        <p className={`text-muted text-sm mt-2 ${expanded ? '' : 'line-clamp-2'}`}>{application.promotionPlan}</p>
                      </div>
                    </div>
                  </button>
                  {expanded && (
                    <div className="mt-4 pt-4 border-t border-dark-border space-y-2 text-sm">
                      <p className="text-muted">
                        <span className="text-foreground font-medium">WhatsApp: </span>
                        <a href={`tel:${application.whatsapp.replace(/\s+/g, '')}`} className="text-primary-text hover:underline">
                          {application.whatsapp}
                        </a>
                      </p>
                      <p className="text-muted">
                        <span className="text-foreground font-medium">Email: </span>
                        <a href={`mailto:${application.email}`} className="text-primary-text hover:underline">
                          {application.email}
                        </a>
                      </p>
                      <p className="text-muted">
                        <span className="text-foreground font-medium">University / Institute: </span>
                        {application.university}
                      </p>
                      <p className="text-muted">
                        <span className="text-foreground font-medium">Department &amp; Semester: </span>
                        {application.departmentSemester}
                      </p>
                      <p className="text-muted">
                        <span className="text-foreground font-medium">Leadership position: </span>
                        {application.leadershipPosition}
                      </p>
                      <p className="text-muted">
                        <span className="text-foreground font-medium">Ambassador work before: </span>
                        {application.priorAmbassadorExperience}
                      </p>
                      <div className="text-muted">
                        <span className="text-foreground font-medium">How they plan to promote CodeBettle: </span>
                        <span className="whitespace-pre-line">{application.promotionPlan}</span>
                      </div>
                      <div className="flex gap-2 flex-wrap pt-2">
                        {application.status !== 'approved' && (
                          <Button size="sm" onClick={() => changeStatus(application, 'approved')}>
                            Approve
                          </Button>
                        )}
                        {application.status !== 'rejected' && (
                          <Button size="sm" variant="outline" onClick={() => changeStatus(application, 'rejected')}>
                            Reject
                          </Button>
                        )}
                        {application.status !== 'pending' && (
                          <Button size="sm" variant="ghost" onClick={() => changeStatus(application, 'pending')}>
                            Back to pending
                          </Button>
                        )}
                        <Button size="sm" variant="danger" onClick={() => handleDelete(application)}>
                          <Trash2 className="w-4 h-4" /> Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </FadeIn>
            );
          })}
        </div>
      )}
    </div>
  );
}
