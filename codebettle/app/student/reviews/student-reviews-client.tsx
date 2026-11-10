'use client';
import { useState } from 'react';
import { Star, Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import FadeIn from '@/components/ui/FadeIn';
import StarRating from '@/components/ui/StarRating';
import type { PublicCourse, Review } from '@/lib/db/types';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

interface StudentReviewsClientProps {
  initialReviews: Review[];
  /** Courses the student is enrolled in — only these can be reviewed. */
  enrolledCourses: PublicCourse[];
  coursesById: Record<string, PublicCourse>;
  studentId: string;
}

export default function StudentReviewsClient({ initialReviews, enrolledCourses, coursesById, studentId: STUDENT_ID }: StudentReviewsClientProps) {
  const [myReviews, setMyReviews] = useState(initialReviews);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');

  // One review per course: courses already reviewed are not offered again.
  const reviewableCourses = enrolledCourses.filter(c => !myReviews.some(r => r.courseId === c.id));

  const handleSubmit = async () => {
    if (!selectedCourse || !newComment.trim()) { toast.error('Please select a course and write a review'); return; }
    try {
      const res = await fetch('/api/student/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: selectedCourse, rating: newRating, comment: newComment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not submit your review');
        return;
      }
      setMyReviews(r => [data.review, ...r]);
      toast.success('Review submitted!');
      setIsModalOpen(false);
      setNewComment('');
      setNewRating(5);
      setSelectedCourse('');
    } catch {
      toast.error('Could not submit your review — please try again');
    }
  };

  const handleDelete = async (review: Review) => {
    try {
      const res = await fetch(`/api/student/reviews/${review.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Could not delete the review');
        return;
      }
      setMyReviews(r => r.filter(r2 => r2.id !== review.id));
      toast.success('Review deleted');
    } catch {
      toast.error('Could not delete the review — please try again');
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">My Reviews</h1>
          <p className="text-muted text-sm mt-1">{myReviews.length} review{myReviews.length !== 1 ? 's' : ''} written</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}><Plus className="w-4 h-4" />Write Review</Button>
      </FadeIn>

      {myReviews.length === 0 ? (
        <Card className="py-16 text-center">
          <Star className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">No reviews yet</p>
          <p className="text-muted text-sm mb-4">Share your experience with fellow students.</p>
          <Button size="sm" onClick={() => setIsModalOpen(true)}>Write a Review</Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {myReviews.map((review, i) => {
            const course = coursesById[review.courseId];
            return (
              <FadeIn key={review.id} delay={Math.min(i, 3) * 0.06}>
              <Card hover>
                <div className="flex items-start gap-4">
                  {course && <img src={course.thumbnail} alt={course.title} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm mb-1">{course?.title || 'Unknown Course'}</p>
                    <StarRating rating={review.rating} size="sm" />
                    <p className="text-muted text-sm mt-2">{review.comment}</p>
                    <p className="text-muted text-xs mt-2">{formatDateShort(review.createdAt)}</p>
                  </div>
                  <button onClick={() => handleDelete(review)} className="text-muted hover:text-red-400 transition-colors cursor-pointer p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
              </FadeIn>
            );
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Write a Review">
        <div className="space-y-4">
          <Select
            label="Select Course"
            value={selectedCourse}
            onChange={e => setSelectedCourse(e.target.value)}
            options={[{ value: '', label: reviewableCourses.length === 0 ? 'No courses left to review' : 'Choose a course...' }, ...reviewableCourses.map(c => ({ value: c.id, label: c.title }))]}
          />
          <div>
            <label className="text-sm font-medium text-white/80 block mb-2">Your Rating</label>
            <StarRating rating={newRating} interactive onChange={setNewRating} size="lg" />
          </div>
          <Textarea label="Your Review" placeholder="Share your experience with this course..." value={newComment} onChange={e => setNewComment(e.target.value)} rows={4} />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button fullWidth onClick={handleSubmit}>Submit Review</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
