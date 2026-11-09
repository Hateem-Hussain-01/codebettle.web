import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getCourseBySlug } from '@/lib/db/courses';
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
export default async function CourseDetailPage({ params }: PageProps<'/courses/[slug]'>) {
  await connection();
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course) notFound();

  const instructor = await getUserById(course.instructorId);
  const reviews = await getReviewsByCourse(course.id);
  return <CourseDetailClient course={course} instructor={instructor} reviews={reviews} slug={slug} />;
}
