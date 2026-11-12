'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FadeIn from '@/components/ui/FadeIn';
import TrackingTimeline, { type TrackingViewShape } from '@/components/applicant/TrackingTimeline';
import toast from 'react-hot-toast';

interface Summary {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  currentStageName: string;
  nextStageName: string | null;
}

/**
 * Applicant dashboard: a count overview, the latest application's
 * tracking timeline, and the way to a new application. An applicant
 * with no applications yet gets the empty state + the new-application
 * link (the layout deliberately does not block them).
 */
export default function ApplicantDashboardPage() {
  const [apps, setApps] = useState<Summary[]>([]);
  const [tracking, setTracking] = useState<TrackingViewShape | null>(null);
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
        const list: Summary[] = data.applications ?? [];
        setApps(list);
        if (list.length > 0) {
          const trackRes = await fetch(`/api/applicant/applications/${list[0].id}`, { cache: 'no-store' });
          const trackData = await trackRes.json().catch(() => ({}));
          if (!cancelled && trackRes.ok) setTracking(trackData.tracking);
        }
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

  const pending = apps.filter((a) => a.status === 'pending').length;
  const approved = apps.filter((a) => a.status === 'approved').length;

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Applicant Dashboard</h1>
        <p className="text-muted text-sm mt-1">Track your instructor application — no teacher features live here until you are onboarded.</p>
      </FadeIn>

      {loading && <p className="text-muted text-sm">Loading your applications…</p>}

      {!loading && apps.length === 0 && (
        <Card>
          <p className="text-foreground font-semibold mb-1">No application yet</p>
          <p className="text-muted text-sm mb-4">You have not applied to teach at CodeBettle yet. It takes a few minutes — CV, demo lecture, LinkedIn and a short note on why you are a good fit.</p>
          <Link href="/applicant/new">
            <Button>Start a New Application</Button>
          </Link>
        </Card>
      )}

      {!loading && apps.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card><p className="text-2xl font-black text-foreground">{apps.length}</p><p className="text-muted text-xs">Applications</p></Card>
            <Card><p className="text-2xl font-black text-foreground">{pending}</p><p className="text-muted text-xs">Pending</p></Card>
            <Card><p className="text-2xl font-black text-foreground">{approved}</p><p className="text-muted text-xs">Approved</p></Card>
          </div>
          {tracking && (
            <FadeIn delay={0.05}>
              <h2 className="text-foreground font-semibold mb-3">Latest application</h2>
              <TrackingTimeline tracking={tracking} />
            </FadeIn>
          )}
          <Link href="/applicant/application" className="text-primary-text text-sm hover:underline">
            View all my applications →
          </Link>
        </>
      )}
    </div>
  );
}
