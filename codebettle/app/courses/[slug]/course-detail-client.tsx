'use client';
import { useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import StarRating from '@/components/ui/StarRating';
import Input from '@/components/ui/Input';
import type { PublicCourse, Review, SafeUser } from '@/lib/db/types';
import { formatPrice, getLevelColor, getCategoryColor, formatDate, getTotalLessonsCount, getCourseDuration } from '@/lib/utils';
import { ChevronDown, ChevronUp, BookOpen, Clock, Users, Award, CheckCircle, Tag, Play } from 'lucide-react';
import FadeIn from '@/components/ui/FadeIn';
import toast from 'react-hot-toast';

interface CourseDetailClientProps {
  course: PublicCourse;
  instructor: SafeUser | null;
  reviews: Review[];
  slug: string;
  /** True when the signed-in student is already enrolled (false for visitors / other roles). */
  enrolled: boolean;
}

export default function CourseDetailClient({ course, instructor, reviews, slug, enrolled }: CourseDetailClientProps) {
  const totalLessons = getTotalLessonsCount(course.modules);
  const duration = getCourseDuration(course.modules);

  const [openModules, setOpenModules] = useState<Record<string, boolean>>({ [course.modules[0]?.id]: true });
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ type: string; value: number } | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  const toggleModule = (id: string) => setOpenModules(prev => ({ ...prev, [id]: !prev[id] }));

  const handleApplyCoupon = async () => {
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode }),
      });
      const data = await res.json();
      const coupon = data.valid ? data.coupon : null;
      if (coupon) {
        setAppliedCoupon({ type: coupon.type, value: coupon.value });
        toast.success(`Coupon applied! ${coupon.type === 'percentage' ? coupon.value + '% off' : 'PKR ' + coupon.value + ' off'}`);
      } else {
        toast.error('Invalid or expired coupon code');
      }
    } catch {
      toast.error('Invalid or expired coupon code');
    }
  };

  const discountedPrice = appliedCoupon
    ? appliedCoupon.type === 'percentage'
      ? course.price - Math.round(course.price * appliedCoupon.value / 100)
      : Math.max(0, course.price - appliedCoupon.value)
    : course.price;

  /**
   * Real enrolment (Phase 7). POSTs to /api/student/enrollments: free
   * courses enrol immediately, paid courses enrol as payment-pending
   * (no payment gateway — an admin confirms the payment). Not signed
   * in → login with a redirect back here. Already enrolled (409) →
   * straight to the student course page.
   */
  const handleEnroll = async () => {
    if (enrolled) {
      window.location.href = `/student/courses/${course.id}`;
      return;
    }
    setEnrolling(true);
    try {
      const res = await fetch('/api/student/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: course.id,
          couponCode: appliedCoupon ? couponCode : undefined,
        }),
      });
      if (res.status === 401) {
        toast.success('Please sign in to enrol');
        setTimeout(() => window.location.href = '/auth/login?redirect=/courses/' + slug, 800);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast.success('You are already enrolled');
        setTimeout(() => window.location.href = `/student/courses/${course.id}`, 800);
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
      setTimeout(() => window.location.href = `/student/courses/${course.id}`, 800);
    } catch {
      toast.error('Enrolment failed — please try again');
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        {/* Hero */}
        <div className="bg-dark-card border-b border-dark-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid lg:grid-cols-3 gap-10">
              <FadeIn className="lg:col-span-2">
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${getCategoryColor(course.category)}`}>{course.category}</span>
                <h1 className="text-3xl sm:text-4xl font-black text-white mt-3 mb-4">{course.title}</h1>
                <p className="text-muted text-lg mb-6">{course.description}</p>
                <div className="flex flex-wrap items-center gap-4 text-sm mb-6">
                  <div className="flex items-center gap-1.5">
                    <StarRating rating={course.rating} size="sm" />
                    <span className="text-primary font-bold">{course.rating}</span>
                    <span className="text-muted">({course.reviewCount} reviews)</span>
                  </div>
                  <span className="flex items-center gap-1.5 text-muted"><Users className="w-4 h-4" />{course.enrolledCount.toLocaleString()} students</span>
                  <span className="flex items-center gap-1.5 text-muted"><BookOpen className="w-4 h-4" />{totalLessons} lessons</span>
                  <span className="flex items-center gap-1.5 text-muted"><Clock className="w-4 h-4" />{duration}</span>
                </div>
                <div className="flex items-center gap-3">
                  {instructor && (
                    <div className="flex items-center gap-2">
                      <img src={instructor.avatar} alt={instructor.name} className="w-8 h-8 rounded-full border border-primary/30" />
                      <span className="text-sm text-muted">by <span className="text-primary font-medium">{instructor.name}</span></span>
                    </div>
                  )}
                  <Badge variant={course.level === 'beginner' ? 'success' : course.level === 'intermediate' ? 'info' : 'danger'}>
                    {course.level.charAt(0).toUpperCase() + course.level.slice(1)}
                  </Badge>
                </div>
              </FadeIn>

              {/* Enrollment card */}
              <div className="lg:col-span-1">
                <div className="bg-surface border border-dark-border rounded-xl overflow-hidden sticky top-20">
                  <img src={course.thumbnail} alt={course.title} className="w-full h-44 object-cover" />
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`text-3xl font-black ${course.isFree ? 'text-green-400' : 'text-primary'}`}>
                        {formatPrice(discountedPrice)}
                      </span>
                      {appliedCoupon && !course.isFree && (
                        <span className="text-lg text-muted line-through">{formatPrice(course.price)}</span>
                      )}
                    </div>
                    {!course.isFree && (
                      <div className="flex gap-2 mb-4">
                        <Input placeholder="Coupon code" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} icon={<Tag className="w-4 h-4" />} />
                        <Button variant="outline" size="sm" onClick={handleApplyCoupon} className="flex-shrink-0">Apply</Button>
                      </div>
                    )}
                    <Button fullWidth size="lg" neon onClick={handleEnroll} disabled={enrolling} className="mb-3">
                      {enrolled ? 'Continue Learning' : enrolling ? 'Enrolling…' : course.isFree ? 'Enroll for Free' : 'Enroll Now'}
                    </Button>
                    <p className="text-muted text-xs text-center">30-day money-back guarantee</p>
                    <div className="mt-4 pt-4 border-t border-dark-border space-y-2 text-xs text-muted">
                      <p className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-primary" />Lifetime access to recordings</p>
                      <p className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-primary" />Downloadable materials</p>
                      <p className="flex items-center gap-2"><Award className="w-3.5 h-3.5 text-primary" />Certificate of completion</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-10">
              {/* What you'll learn */}
              <FadeIn>
              <section>
                <h2 className="text-xl font-bold text-white mb-4">What You'll Learn</h2>
                <div className="bg-dark-card border border-dark-border rounded-xl p-5 grid sm:grid-cols-2 gap-3">
                  {course.whatYouLearn.map(item => (
                    <p key={item} className="flex items-start gap-2 text-sm text-muted">
                      <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />{item}
                    </p>
                  ))}
                </div>
              </section>
              </FadeIn>

              {/* Curriculum */}
              <FadeIn delay={0.05}>
              <section>
                <h2 className="text-xl font-bold text-white mb-4">Course Curriculum</h2>
                <div className="space-y-3">
                  {course.modules.map(mod => (
                    <div key={mod.id} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleModule(mod.id)}
                        className="flex items-center justify-between w-full px-5 py-4 hover:bg-dark-border/30 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <BookOpen className="w-4 h-4 text-primary" />
                          <span className="font-semibold text-white text-sm">{mod.title}</span>
                          <span className="text-xs text-muted">({mod.lessons.length} lessons)</span>
                        </div>
                        {openModules[mod.id] ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                      </button>
                      {openModules[mod.id] && (
                        <div className="border-t border-dark-border">
                          {mod.lessons.map((lesson, li) => (
                            <div key={lesson.id} className="flex items-center gap-3 px-5 py-3 text-sm border-b border-dark-border/50 last:border-0">
                              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs flex-shrink-0">{li + 1}</span>
                              <div className="flex-1">
                                <p className="text-white">{lesson.title}</p>
                                <p className="text-xs text-muted">{lesson.description}</p>
                              </div>
                              <span className="text-xs text-muted">{lesson.duration}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              </FadeIn>

              {/* Reviews */}
              {reviews.length > 0 && (
                <FadeIn delay={0.05}>
                <section>
                  <h2 className="text-xl font-bold text-white mb-4">Student Reviews</h2>
                  <div className="space-y-4">
                    {reviews.map(review => (
                      <div key={review.id} className="bg-dark-card border border-dark-border rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">{review.studentId.slice(-2).toUpperCase()}</div>
                          <div>
                            <StarRating rating={review.rating} size="sm" />
                            <p className="text-xs text-muted">{formatDate(review.createdAt)}</p>
                          </div>
                        </div>
                        <p className="text-sm text-muted">{review.comment}</p>
                      </div>
                    ))}
                  </div>
                </section>
                </FadeIn>
              )}
            </div>

            {/* Instructor sidebar */}
            {instructor && (
              <div className="lg:col-span-1">
                <div className="bg-dark-card border border-dark-border rounded-xl p-5 sticky top-20">
                  <h3 className="font-bold text-white mb-4">About the Instructor</h3>
                  <div className="flex items-center gap-3 mb-4">
                    <img src={instructor.avatar} alt={instructor.name} className="w-14 h-14 rounded-full border-2 border-primary/30" />
                    <div>
                      <p className="font-semibold text-white">{instructor.name}</p>
                      <p className="text-xs text-muted">{instructor.expertise?.slice(0, 2).join(' & ')}</p>
                    </div>
                  </div>
                  {instructor.bio && <p className="text-sm text-muted leading-relaxed">{instructor.bio}</p>}
                  {instructor.expertise && (
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      {instructor.expertise.map(e => (
                        <span key={e} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{e}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
