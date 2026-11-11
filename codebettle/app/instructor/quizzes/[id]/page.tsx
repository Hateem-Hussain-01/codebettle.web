import { connection } from 'next/server';
import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getQuizForTeacher } from '@/lib/services/quiz-service';
import QuizDetailClient from './quiz-detail-client';

export default async function InstructorQuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const session = await getSession();
  if (!session) redirect('/auth/login');
  const { id } = await params;
  // Phase 2: pass the flags through so the quiz service sees the real capabilities.
  const actor = { id: session.id, role: session.role as 'admin' | 'instructor', name: session.name, isAdmin: session.isAdmin, isTeacher: session.isTeacher };
  const result = await getQuizForTeacher(actor, id);
  if ('error' in result) notFound();
  return <QuizDetailClient quiz={result.quiz} />;
}
