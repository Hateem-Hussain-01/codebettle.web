import { connection } from 'next/server';
import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getAttemptForStudent } from '@/lib/services/quiz-service';
import AttemptClient from './attempt-client';

export default async function StudentAttemptPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  await connection();
  const session = await getSession();
  if (!session) redirect('/auth/login');
  const { attemptId } = await params;
  const actor = { id: session.id, role: 'student' as const, name: session.name };
  const result = await getAttemptForStudent(actor, attemptId);
  if ('error' in result) notFound();
  if (result.attempt.status !== 'in_progress') {
    redirect(`/student/quizzes/${result.quiz.id}`);
  }
  return <AttemptClient attempt={result.attempt} quiz={result.quiz} serverNow={result.serverNow} />;
}
