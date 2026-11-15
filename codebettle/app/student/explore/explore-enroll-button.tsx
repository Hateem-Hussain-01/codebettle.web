'use client';
import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Enrol button for one course on the Explore page.
 *
 * Reuses the exact enrolment path as the public course page
 * (course-detail-client.tsx): POST /api/student/enrollments with only
 * the courseId — the server resolves the open batch, sets
 * paymentStatus to 'free' or 'pending' itself, and returns 409 when
 * the student is already enrolled. No second enrolment path exists.
 */
export default function ExploreEnrollButton({ courseId, isFree }: { courseId: string; isFree: boolean }) {
  const [enrolling, setEnrolling] = useState(false);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      const res = await fetch('/api/student/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });
      if (res.status === 401) {
        toast.error('Please sign in to enrol');
        setTimeout(() => window.location.href = '/auth/login?redirect=/student/explore', 800);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast.success('You are already enrolled');
        setTimeout(() => window.location.href = `/student/courses/${courseId}`, 800);
        return;
      }
      if (!res.ok) {
        toast.error(data.error || 'Enrolment failed — please try again');
        return;
      }
      toast.success(
        data.enrollment?.paymentStatus === 'pending'
          ? 'Enrolled! Your payment is pending — an admin will confirm it.'
          : 'Enrolled! Welcome to the course.',
      );
      setTimeout(() => window.location.href = `/student/courses/${courseId}`, 800);
    } catch {
      toast.error('Enrolment failed — please try again');
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <button
      onClick={handleEnroll}
      disabled={enrolling}
      className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-ink rounded-lg text-xs font-bold hover:bg-primary-dark transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <BookOpen className="w-3.5 h-3.5" />
      {enrolling ? 'Enrolling…' : isFree ? 'Enroll for Free' : 'Enroll Now'}
    </button>
  );
}
