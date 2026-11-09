import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { getSession } from '@/lib/auth';
import { getInstructors } from '@/lib/db/users';
import { getCoursesByInstructor, getPublishedCourses } from '@/lib/db/courses';
import type { Course } from '@/lib/db/types';
import { BookOpen, Users } from 'lucide-react';

export default async function InstructorsPage() {
  const session = await getSession();
  const instructors = await getInstructors();
  const published = await getPublishedCourses();

  // Published courses per instructor, fetched once (was a sync call inside JSX per instructor).
  const taughtByInstructor = new Map<string, Course[]>();
  await Promise.all(
    instructors.map(async (inst) => {
      const taught = (await getCoursesByInstructor(inst.id)).filter((c) => c.status === 'published');
      taughtByInstructor.set(inst.id, taught);
    }),
  );

  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        <div className="py-20 bg-dark-card border-b border-dark-border text-center">
          <div className="max-w-3xl mx-auto px-4">
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Meet Our Team</span>
            <h1 className="text-4xl sm:text-5xl font-black text-white mt-2 mb-4">
              Learn From <span className="gradient-text">Industry Experts</span>
            </h1>
            <p className="text-muted text-lg leading-relaxed">
              Our instructors are working software engineers and designers who teach
              what they practise every day.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {instructors.map((inst) => {
              const taught = taughtByInstructor.get(inst.id) ?? [];
              return (
                <div
                  key={inst.id}
                  className="bg-dark-card border border-dark-border rounded-2xl p-6 hover:border-primary/30 transition-all"
                >
                  <div className="flex items-start gap-4">
                    <img
                      src={inst.avatar}
                      alt={inst.name}
                      className="w-20 h-20 rounded-full border-2 border-primary/30 flex-shrink-0"
                    />
                    <div>
                      <h2 className="text-white font-bold text-xl">{inst.name}</h2>
                      <p className="text-primary text-sm font-medium mt-0.5">
                        {inst.expertise?.slice(0, 3).join(' · ')}
                      </p>
                      {inst.bio && (
                        <p className="text-muted text-sm leading-relaxed mt-2">{inst.bio}</p>
                      )}
                      <p className="flex items-center gap-1.5 text-muted text-xs mt-3">
                        <BookOpen className="w-3.5 h-3.5" />
                        {taught.length} course{taught.length === 1 ? '' : 's'} taught
                      </p>
                    </div>
                  </div>

                  {taught.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-dark-border space-y-2">
                      {taught.map((course) => (
                        <Link
                          key={course.id}
                          href={`/courses/${course.slug}`}
                          className="flex items-center justify-between gap-3 text-sm group"
                        >
                          <span className="text-white/90 group-hover:text-primary transition-colors">
                            {course.title}
                          </span>
                          <span className="text-muted text-xs whitespace-nowrap">
                            {course.isFree ? 'Free' : `PKR ${course.price.toLocaleString()}`}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="text-center mt-16 bg-dark-card border border-dark-border rounded-2xl p-8">
            <Users className="w-8 h-8 text-primary mx-auto mb-3" />
            <h2 className="text-2xl font-black text-white">Want to teach with us?</h2>
            <p className="text-muted text-sm mt-2 mb-5">
              {published.length} published courses and growing — join the instructor team.
            </p>
            <Link
              href="/become-instructor"
              className="inline-flex items-center justify-center gap-2 font-semibold rounded-lg bg-primary text-dark hover:bg-primary-dark px-6 py-3 text-base transition-all"
            >
              Become an Instructor
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
