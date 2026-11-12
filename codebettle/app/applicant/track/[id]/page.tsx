'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import FadeIn from '@/components/ui/FadeIn';
import TrackingTimeline, { type TrackingViewShape } from '@/components/applicant/TrackingTimeline';
import toast from 'react-hot-toast';

/**
 * Track My Application: the applicant-safe tracking view for one of
 * the caller's own applications. A non-owner gets a 404 from the API
 * (the page shows "not found" — it never reveals someone else's
 * application). Only the current stage, completed stages, the next
 * stage, instructions, latest update and own notifications are shown.
 */
export default function ApplicantTrackPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const [tracking, setTracking] = useState<TrackingViewShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/applicant/applications/${id}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          toast.error(data.error || 'Could not load this application');
          return;
        }
        setTracking(data.tracking);
      } catch {
        if (!cancelled) toast.error('Could not load this application');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Track My Application</h1>
        <p className="text-muted text-sm mt-1">Your current stage, what is done, and what comes next — nothing beyond that.</p>
      </FadeIn>
      {loading && <p className="text-muted text-sm">Loading…</p>}
      {!loading && notFound && (
        <p className="text-muted text-sm">
          Application not found. <Link href="/applicant/application" className="text-primary-text hover:underline">Back to my applications</Link>
        </p>
      )}
      {!loading && !notFound && tracking && <TrackingTimeline tracking={tracking} />}
    </div>
  );
}
