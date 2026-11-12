import { connection } from 'next/server';
import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { listMyAttempts, listAvailableQuizzes } from '@/lib/services/quiz-service';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import StudentQuizStartClient from './student-quiz-start-client';

export default async function StudentQuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const session = await getSession();
  if (!session) redirect('/auth/login');
  const { id } = await params;
  const actor = { id: session.id, role: 'student' as const, name: session.name };
  const [attemptsResult, availableResult] = await Promise.all([
    listMyAttempts(actor, id),
    listAvailableQuizzes(actor),
  ]);
  if ('error' in attemptsResult) notFound();
  const entry = availableResult && !('error' in availableResult)
    ? availableResult.quizzes.find((q) => q.quiz.id === id)
    : undefined;
  const quiz = attemptsResult.quiz;

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">{quiz.title}</h1>
        <p className="text-muted text-sm mt-1">
          {quiz.questions.length} question{quiz.questions.length !== 1 ? 's' : ''}
          {quiz.timeLimitMin ? ` · ${quiz.timeLimitMin} min` : ' · no time limit'}
          {quiz.passMark !== null && quiz.passMark !== undefined ? ` · pass ${quiz.passMark}%` : ''}
        </p>
        {quiz.description && <p className="text-muted text-sm mt-2">{quiz.description}</p>}
        {quiz.instructions && (
          <Card className="p-4 mt-4">
            <h2 className="text-foreground font-semibold text-sm mb-1">Instructions</h2>
            <p className="text-muted text-sm whitespace-pre-wrap">{quiz.instructions}</p>
          </Card>
        )}
      </FadeIn>

      <StudentQuizStartClient
        quizId={quiz.id}
        attemptsLeft={entry?.attemptsLeft ?? 0}
        inProgressAttemptId={entry?.inProgressAttemptId}
      />

      {attemptsResult.attempts.length > 0 && (
        <FadeIn delay={0.1}>
        <Card className="p-5">
          <h2 className="text-foreground font-bold mb-4">My attempts</h2>
          <div className="space-y-3">
            {attemptsResult.attempts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 border-b border-dark-border/50 pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-foreground text-sm">
                    Started {new Date(a.startedAt).toLocaleString()}
                    {a.submittedAt ? ` · submitted ${new Date(a.submittedAt).toLocaleString()}` : ''}
                  </p>
                  <p className="text-muted text-xs mt-1">
                    {a.status === 'submitted'
                      ? `Score: ${a.score ?? '—'} / ${a.totalPoints ?? '—'}${a.submittedLate ? ' · submitted late' : ''}`
                      : 'In progress'}
                  </p>
                </div>
                <Badge variant={a.status === 'submitted' ? 'success' : 'warning'}>{a.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
        </FadeIn>
      )}
    </div>
  );
}
