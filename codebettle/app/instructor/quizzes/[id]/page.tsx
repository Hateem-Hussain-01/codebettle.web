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
  const actor = { id: session.id, role: session.role as 'admin' | 'instructor', name: session.name };
  const result = await getQuizForTeacher(actor, id);
  if ('error' in result) notFound();
  return <QuizDetailClient quiz={result.quiz} />;
}
