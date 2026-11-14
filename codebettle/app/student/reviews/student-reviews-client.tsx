'use client';
import { useState } from 'react';
import { Star, Plus, Trash2, Pencil } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import FadeIn from '@/components/ui/FadeIn';
import StarRating from '@/components/ui/StarRating';
import CourseThumbnail from '@/components/ui/CourseThumbnail';
import type { PublicCourse, Review, ReviewStatus } from '@/lib/db/types';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: 'Pending approval',
  approved: 'Published',
  rejected: 'Not published',
};

const STATUS_CLASS: Record<ReviewStatus, string> = {
  pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  approved: 'bg-green-500/15 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
};

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
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [newRating, setNewRating] = useState(5);
  const [newTitle, setNewTitle] = useState('');
  const [newComment, setNewComment] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');

  // One review per course: courses already reviewed are not offered again.
  const reviewableCourses = enrolledCourses.filter(c => !myReviews.some(r => r.courseId === c.id));

  const openWriteModal = () => {
    setEditingReview(null);
    setNewRating(5);
    setNewTitle('');
    setNewComment('');
    setSelectedCourse('');
    setIsModalOpen(true);
  };

  const openEditModal = (review: Review) => {
    setEditingReview(review);
    setNewRating(review.rating);
    setNewTitle(review.title ?? '');
    setNewComment(review.comment);
    setSelectedCourse(review.courseId);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedCourse || !newComment.trim()) { toast.error('Please select a course and write a review'); return; }
    try {
      const isEdit = editingReview !== null;
      const res = await fetch(isEdit ? `/api/student/reviews/${editingReview.id}` : '/api/student/reviews', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit
          ? { rating: newRating, title: newTitle.trim() || null, comment: newComment }
          : { courseId: selectedCourse, rating: newRating, title: newTitle.trim() || null, comment: newComment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not submit your review');
        return;
      }
      if (isEdit) {
        setMyReviews(r => r.map(r2 => (r2.id === editingReview.id ? data.review : r2)));
        toast.success('Review updated! It will appear on the course page after approval.');
      } else {
        setMyReviews(r => [data.review, ...r]);
        toast.success('Review submitted! It will appear on the course page after approval.');
      }
      setIsModalOpen(false);
      setEditingReview(null);
      setNewComment('');
      setNewTitle('');
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
          <h1 className="text-2xl font-black text-foreground">My Reviews</h1>
          <p className="text-muted text-sm mt-1">{myReviews.length} review{myReviews.length !== 1 ? 's' : ''} written</p>
        </div>
        <Button onClick={openWriteModal}><Plus className="w-4 h-4" />Write Review</Button>
      </FadeIn>

      {myReviews.length === 0 ? (
        <Card className="py-16 text-center">
          <Star className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-foreground font-semibold mb-2">No reviews yet</p>
          <p className="text-muted text-sm mb-4">Share your experience with fellow students.</p>
          <Button size="sm" onClick={openWriteModal}>Write a Review</Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {myReviews.map((review, i) => {
            const course = coursesById[review.courseId];
            return (
              <FadeIn key={review.id} delay={Math.min(i, 3) * 0.06}>
              <Card hover>
                <div className="flex items-start gap-4">
                  {course && <CourseThumbnail src={course.thumbnail} alt={course.title} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-foreground font-semibold text-sm">{course?.title || 'Unknown Course'}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[review.status]}`}>
                        {STATUS_LABEL[review.status]}
                      </span>
                    </div>
                    <StarRating rating={review.rating} size="sm" />
                    {review.title && <p className="text-foreground font-semibold text-sm mt-2">{review.title}</p>}
                    <p className="text-muted text-sm mt-2">{review.comment}</p>
                    <p className="text-muted text-xs mt-2">{formatDateShort(review.createdAt)}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => openEditModal(review)} title="Edit review" className="text-muted hover:text-yellow-400 transition-colors cursor-pointer p-1">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(review)} title="Delete review" className="text-muted hover:text-red-400 transition-colors cursor-pointer p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
              </FadeIn>
            );
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingReview ? 'Edit Your Review' : 'Write a Review'}>
        <div className="space-y-4">
          {editingReview ? (
            <p className="text-sm text-muted">
              Editing your review for <span className="font-semibold text-foreground">{coursesById[editingReview.courseId]?.title || 'this course'}</span>.
              It will go back to pending approval after you save.
            </p>
          ) : (
            <Select
              label="Select Course"
              value={selectedCourse}
              onChange={e => setSelectedCourse(e.target.value)}
              options={[{ value: '', label: reviewableCourses.length === 0 ? 'No courses left to review' : 'Choose a course...' }, ...reviewableCourses.map(c => ({ value: c.id, label: c.title }))]}
            />
          )}
          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-2">Your Rating</label>
            <StarRating rating={newRating} interactive onChange={setNewRating} size="lg" />
          </div>
          <Input label="Title (optional)" placeholder="A short headline for your review" value={newTitle} maxLength={200} onChange={e => setNewTitle(e.target.value)} />
          <Textarea label="Your Review" placeholder="Share your experience with this course..." value={newComment} onChange={e => setNewComment(e.target.value)} rows={4} />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button fullWidth onClick={handleSubmit}>{editingReview ? 'Save Changes' : 'Submit Review'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
