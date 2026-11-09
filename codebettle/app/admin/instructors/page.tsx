import { connection } from 'next/server';
import { getInstructors } from '@/lib/db/users';
import { getAllCourses } from '@/lib/db/courses';
import InstructorsClient from './instructors-client';

/**
 * Admin instructors — server wrapper (Phase 2).
 * Fetches instructors and all courses on the server; the per-instructor
 * course count becomes a map passed as a prop.
 */
export default async function AdminInstructorsPage() {
  await connection();
  const [instructors, courses] = await Promise.all([getInstructors(), getAllCourses()]);
  const courseCounts: Record<string, number> = {};
  for (const course of courses) {
    courseCounts[course.instructorId] = (courseCounts[course.instructorId] ?? 0) + 1;
  }
  return <InstructorsClient instructors={instructors} courseCounts={courseCounts} />;
}
