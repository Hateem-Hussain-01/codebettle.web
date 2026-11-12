'use client';
import { useCallback, useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import FadeIn from '@/components/ui/FadeIn';
import { Check, X, ExternalLink, FileImage, Clock } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { PaymentSubmission, PaymentSubmissionStatus } from '@/lib/db/types';

interface EnrichedSubmission extends PaymentSubmission {
  studentName?: string | null;
  studentEmail?: string | null;
  courseTitle?: string | null;
  coursePrice?: number | null;
  couponUsed?: string | null;
  enrollmentPaymentStatus?: string | null;
}

type StatusFilter = 'all' | PaymentSubmissionStatus;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'submitted', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_BADGE: Record<PaymentSubmissionStatus, 'warning' | 'success' | 'danger'> = {
  submitted: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const STATUS_LABEL: Record<PaymentSubmissionStatus, string> = {
  submitted: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

/**
 * Admin payment verification queue (Phase 1c) — backed by
 * GET /api/admin/payments and PATCH /api/admin/payments/[id].
 * Pending submissions come first. Each row shows the student, course,
 * transaction ID, amount (against the course price), the proof
 * screenshot (opened through the signed-URL route, 1h expiry) and the
 * date. Approve flips the enrolment to paid with the submitted amount
 * and writes a `payment.approve` audit entry; reject asks for an
 * optional reason, writes `payment.reject`, notifies the student, and
 * lifts the pending block so they can submit again.
 */
export default function PaymentsClient() {
  const [submissions, setSubmissions] = useState<EnrichedSubmission[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('submitted');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reviewTarget, setReviewTarget] = useState<EnrichedSubmission | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [proofUrl, setProofUrl] = useState('');
  const [proofLoading, setProofLoading] = useState(false);

  const load = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    setLoadError('');
    try {
      const query = status === 'all' ? '' : `?reviewStatus=${status}`;
      const res = await fetch(`/api/admin/payments${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load payment submissions');
      setSubmissions(data.submissions);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load payment submissions');
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { load(filter); }, [filter, load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const openReview = (submission: EnrichedSubmission, decision: 'approved' | 'rejected') => {
    setReviewTarget(submission);
    setReviewDecision(decision);
    setReviewNote('');
    setProofUrl('');
  };

  const openProof = async (submission: EnrichedSubmission) => {
    if (!submission.proofUrl) return;
    setProofLoading(true);
    try {
      const res = await fetch(`/api/admin/payments/${submission.id}/proof`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not open the proof');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the proof');
    } finally {
      setProofLoading(false);
    }
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/payments/${reviewTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: reviewDecision, reviewNote: reviewNote.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not review this payment'); return; }
      setSubmissions((list) =>
        list.map((s) => (s.id === reviewTarget.id ? { ...s, ...data.submission } : s)),
      );
      setReviewTarget(null);
      toast.success(
        reviewDecision === 'approved'
          ? 'Payment approved — enrolment marked paid'
          : 'Payment rejected — student notified and can submit again',
      );
      load(filter);
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = submissions.filter((s) => s.reviewStatus === 'submitted').length;

  return (
    <FadeIn className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">Payment Verifications</h1>
          <p className="text-muted text-sm mt-1">
            Review student payment submissions. Approving marks the enrolment paid with the submitted amount.
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge variant="warning">
            <Clock className="w-3 h-3" /> {pendingCount} awaiting review
          </Badge>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
              filter === f.value
                ? 'bg-primary/15 text-primary-text border-primary/30'
                : 'bg-dark-card text-muted border-dark-border hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card className="py-10 text-center text-muted text-sm">Loading payment submissions…</Card>
      ) : loadError ? (
        <Card className="py-10 text-center text-red-400 text-sm">{loadError}</Card>
      ) : submissions.length === 0 ? (
        <Card className="py-10 text-center">
          <FileImage className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted text-sm">No payment submissions here yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-52">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-foreground font-semibold text-sm">{s.studentName ?? 'Unknown student'}</p>
                    <Badge variant={STATUS_BADGE[s.reviewStatus]}>{STATUS_LABEL[s.reviewStatus]}</Badge>
                    {s.couponUsed && <Badge variant="muted">Coupon: {s.couponUsed}</Badge>}
                  </div>
                  <p className="text-muted text-xs mt-0.5">{s.studentEmail ?? ''}</p>
                  <p className="text-muted text-xs mt-1">
                    {s.courseTitle ?? 'Unknown course'}
                    {s.coursePrice !== null && s.coursePrice !== undefined && (
                      <span> · Course price: PKR {s.coursePrice.toLocaleString()}</span>
                    )}
                  </p>
                  <p className="text-foreground text-sm mt-2">
                    PKR {s.amountPkr.toLocaleString()}
                    <span className="text-muted text-xs"> · {s.accountSnapshot.label} ({s.accountSnapshot.accountHolder})</span>
                  </p>
                  <p className="text-muted text-xs mt-0.5">
                    Transaction ref: <span className="text-foreground font-mono">{s.transactionRef}</span>
                    {' · '}Submitted {formatDateShort(s.submittedAt)}
                  </p>
                  {s.reviewedAt && (
                    <p className="text-muted text-xs mt-0.5">
                      Reviewed {formatDateShort(s.reviewedAt)}
                      {s.reviewNote ? ` — “${s.reviewNote}”` : ''}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-stretch">
                  {s.proofUrl && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openProof(s)}
                      disabled={proofLoading}
                    >
                      <ExternalLink className="w-4 h-4" /> View proof
                    </Button>
                  )}
                  {s.reviewStatus === 'submitted' && (
                    <>
                      <Button size="sm" onClick={() => openReview(s, 'approved')}>
                        <Check className="w-4 h-4" /> Approve
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => openReview(s, 'rejected')}>
                        <X className="w-4 h-4" /> Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={reviewTarget !== null}
        onClose={() => setReviewTarget(null)}
        title={reviewDecision === 'approved' ? 'Approve payment' : 'Reject payment'}
      >
        {reviewTarget && (
          <div className="space-y-4">
            <p className="text-muted text-sm">
              {reviewDecision === 'approved' ? (
                <>
                  Approving marks <span className="text-foreground font-medium">{reviewTarget.studentName}</span>’s
                  enrolment in <span className="text-foreground font-medium">{reviewTarget.courseTitle}</span> as{' '}
                  <span className="text-green-400 font-medium">paid</span> with amount{' '}
                  <span className="text-foreground font-medium">PKR {reviewTarget.amountPkr.toLocaleString()}</span>{' '}
                  and writes a <span className="font-mono text-xs">payment.approve</span> audit entry.
                </>
              ) : (
                <>
                  Rejecting notifies <span className="text-foreground font-medium">{reviewTarget.studentName}</span>{' '}
                  and lets them submit their payment again. Add a reason below — the student sees it.
                </>
              )}
            </p>
            <div>
              <label className="text-xs text-muted block mb-1.5">
                {reviewDecision === 'approved' ? 'Note (optional)' : 'Reason (optional, shown to the student)'}
              </label>
              <Input
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={reviewDecision === 'approved' ? 'e.g. Matched bank statement' : 'e.g. No matching transaction found'}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setReviewTarget(null)}>Cancel</Button>
              <Button onClick={submitReview} disabled={saving}>
                {saving ? 'Saving…' : reviewDecision === 'approved' ? 'Approve payment' : 'Reject payment'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </FadeIn>
  );
}
