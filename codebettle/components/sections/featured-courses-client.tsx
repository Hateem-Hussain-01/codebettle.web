'use client';
import CourseCard from '@/components/ui/CourseCard';
import { useWishlist } from '@/hooks/use-wishlist';
import type { PublicCourse } from '@/lib/db/types';

interface FeaturedCoursesClientProps {
  courses: PublicCourse[];
  instructorNames: Record<string, string>;
}

/**
 * Featured-courses grid (client half). The server half fetches the
 * courses; this half adds the wishlist heart for signed-in students
 * (signed-out visitors see no heart — Phase 0d).
 */
export default function FeaturedCoursesClient({ courses, instructorNames }: FeaturedCoursesClientProps) {
  const { wishlistedIds, signedIn, loaded, toggle } = useWishlist();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {courses.map((course, i) => (
        <CourseCard
          key={course.id}
          course={course}
          instructorName={instructorNames[course.instructorId] ?? 'CodeBettle Instructor'}
          index={i}
          isWishlisted={wishlistedIds.has(course.id)}
          onWishlist={signedIn && loaded ? toggle : undefined}
        />
      ))}
    </div>
  );
}
