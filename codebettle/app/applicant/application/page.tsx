'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Summary {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  currentStageName: string;
  nextStageName: string | null;
}

/** My Applications: every application the caller filed, with its current stage and a tracking link. */
export default function ApplicantApplicationsPage() {
  const [apps, setApps] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/applicant/applications', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          toast.error(data.error || 'Could not load your applications');
          return;
        }
        setApps(data.applications ?? []);
      } catch {
        if (!cancelled) toast.error('Could not load your applications');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-white">My Applications</h1>
        <p className="text-muted text-sm mt-1">Every instructor application you have filed. One application can be pending at a time — once it is decided, you can file a new one.</p>
      </FadeIn>

      {loading && <p className="text-muted text-sm">Loading…</p>}
      {!loading && apps.length === 0 && (
        <Card>
          <p className="text-white font-semibold mb-1">No applications yet</p>
          <p className="text-muted text-sm mb-4">Start your first application to teach at CodeBettle.</p>
          <Link href="/applicant/new">
            <Button>Start a New Application</Button>
          </Link>
        </Card>
      )}
      {!loading && apps.length > 0 && (
        <div className="space-y-3">
          {apps.map((app) => (
            <Card key={app.id} className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium font-mono truncate">{app.id}</p>
                <p className="text-muted text-xs mt-1">
                  Submitted {formatDateShort(app.createdAt)} · Current stage: <span className="text-white">{app.currentStageName}</span>
                  {app.nextStageName ? <> · Next: <span className="text-white">{app.nextStageName}</span></> : ''}
                </p>
              </div>
              <Badge variant={app.status === 'approved' ? 'success' : app.status === 'rejected' ? 'danger' : 'warning'}>
                {app.status}
              </Badge>
              <Link href={`/applicant/track/${app.id}`}>
                <Button size="sm" variant="secondary">Track</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
