import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import CourseCard from '@/components/ui/CourseCard';
import FadeIn from '@/components/ui/FadeIn';
import { getFeaturedCourses } from '@/lib/db/courses';
import { toPublicCourse } from '@/lib/db/mappers';
import { getUserById } from '@/lib/db/users';

export default async function FeaturedCourses() {
  const featured = await getFeaturedCourses();
  const instructorNames: Record<string, string> = {};
  for (const id of [...new Set(featured.map((c) => c.instructorId))]) {
    const instructor = await getUserById(id);
    instructorNames[id] = instructor?.name ?? 'CodeBettle Instructor';
  }

  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="flex items-end justify-between mb-12">
          <div>
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Featured Courses</span>
            <h2 className="text-3xl sm:text-4xl font-black text-white mt-2">
              Start Learning <span className="gradient-text">Today</span>
            </h2>
            <p className="text-muted mt-3 max-w-xl">Handpicked courses taught by industry experts. From beginner to advanced, find your perfect learning path.</p>
          </div>
          <Link href="/courses" className="hidden sm:flex items-center gap-2 text-primary text-sm font-medium hover:gap-3 transition-all">
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featured.map((course, i) => (
            <CourseCard
              key={course.id}
              course={toPublicCourse(course)}
              instructorName={instructorNames[course.instructorId] ?? 'CodeBettle Instructor'}
              index={i}
            />
          ))}
        </div>

        <div className="sm:hidden mt-8 text-center">
          <Link href="/courses" className="text-primary text-sm font-medium inline-flex items-center gap-2">
            View All Courses <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
