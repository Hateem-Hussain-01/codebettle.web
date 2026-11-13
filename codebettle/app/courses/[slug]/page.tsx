import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getSession } from '@/lib/auth';
import { getBatchesByCourse, getOpenBatchForCourse } from '@/lib/db/batches';
import { getCourseBySlug } from '@/lib/db/courses';
import { isEnrolled } from '@/lib/db/enrollments';
import { toPublicCourse } from '@/lib/db/mappers';
import { getUserById } from '@/lib/db/users';
import { getReviewsByCourse } from '@/lib/db/reviews';
import CourseDetailClient from './course-detail-client';

/**
 * Course detail — server wrapper (Phase 2).
 * Fetches the course, its instructor and its reviews on the server and
 * passes them to the client component. Coupon validation happens in the
 * client via POST /api/coupons/validate (validateCoupon is server-only).
 * `await connection()` opts out of build-time prerendering (public page,
 * no session to read, and the slug is only known at request time).
 */
/**
 * Per-course metadata (Phase 7, CB-16 SEO): the course title and
 * description in the tab and in link previews, instead of the generic
 * site title on every course page.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course) return { title: 'Course not found | CodeBettle' };
  return {
    title: `${course.title} | CodeBettle`,
    description: course.description,
    openGraph: {
      title: `${course.title} | CodeBettle`,
      description: course.description,
      images: course.thumbnail ? [{ url: course.thumbnail }] : undefined,
    },
  };
}

export default async function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course) notFound();

  const instructor = await getUserById(course.instructorId);
  const reviews = await getReviewsByCourse(course.id);
  // Already-enrolled students see "Continue Learning" instead of the
  // enrol button (the page itself stays public — no session = not enrolled).
  const session = await getSession();
  const enrolled = session?.role === 'student' ? await isEnrolled(session.id, course.id) : false;
  // Batches: the open batch (latest upcoming/ongoing) is what new
  // students enrol in; older batches are shown as history. When the
  // batch table has not been created yet (SQL not run), both are empty
  // and the page enrols without a batch, exactly as before.
  const [openBatch, batches] = await Promise.all([
    getOpenBatchForCourse(course.id),
    getBatchesByCourse(course.id),
  ]);
  return <CourseDetailClient course={toPublicCourse(course)} instructor={instructor} reviews={reviews} slug={slug} enrolled={enrolled} openBatch={openBatch} batches={batches} />;
}
