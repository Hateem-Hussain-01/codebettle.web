import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { listQuizzesForTeacher } from '@/lib/services/quiz-service';
import { getCoursesByInstructor } from '@/lib/db/courses';
import InstructorQuizzesClient from './instructor-quizzes-client';

export default async function InstructorQuizzesPage() {
  await connection();
  const session = await getSession();
  if (!session) redirect('/auth/login');
  // Phase 2: pass the flags through so the quiz service sees the real capabilities.
  const actor = { id: session.id, role: session.role as 'admin' | 'instructor', name: session.name, isAdmin: session.isAdmin, isTeacher: session.isTeacher };
  const [listed, courses] = await Promise.all([
    listQuizzesForTeacher(actor),
    getCoursesByInstructor(session.id),
  ]);
  if ('error' in listed) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-black text-white">Quizzes</h1>
        <p className="text-muted text-sm">Could not load your quizzes: {listed.error}</p>
      </div>
    );
  }
  return <InstructorQuizzesClient quizzes={listed.quizzes} courses={courses} />;
}
