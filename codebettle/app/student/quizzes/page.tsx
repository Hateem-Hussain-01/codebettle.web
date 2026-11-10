import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { listAvailableQuizzes } from '@/lib/services/quiz-service';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { FileQuestion } from 'lucide-react';

export default async function StudentQuizzesPage() {
  await connection();
  const session = await getSession();
  if (!session) redirect('/auth/login');
  const result = await listAvailableQuizzes({ id: session.id, role: 'student', name: session.name });
  if ('error' in result) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-black text-white">Quizzes</h1>
        <p className="text-muted text-sm">Could not load quizzes: {result.error}</p>
      </div>
    );
  }
  const { quizzes } = result;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Quizzes</h1>
        <p className="text-muted text-sm mt-1">Published quizzes for the courses you are enrolled in.</p>
      </div>
      {quizzes.length === 0 ? (
        <Card className="py-16 text-center">
          <FileQuestion className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">No quizzes available</p>
          <p className="text-muted text-sm">Your instructors have not published any quizzes for your courses yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {quizzes.map(({ quiz, attemptsUsed, attemptsLeft, inProgressAttemptId, hasSubmitted }) => (
            <Card key={quiz.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-white font-bold">{quiz.title}</h2>
                  <p className="text-muted text-sm mt-1">
                    {quiz.questions.length} question{quiz.questions.length !== 1 ? 's' : ''}
                    {quiz.timeLimitMin ? ` · ${quiz.timeLimitMin} min` : ' · no time limit'}
                    {quiz.passMark !== null && quiz.passMark !== undefined ? ` · pass ${quiz.passMark}%` : ''}
                  </p>
                  {quiz.description && <p className="text-muted text-sm mt-2">{quiz.description}</p>}
                </div>
                {hasSubmitted ? (
                  <Badge variant="success">Submitted</Badge>
                ) : inProgressAttemptId ? (
                  <Badge variant="warning">In progress</Badge>
                ) : (
                  <Badge variant="muted">Not started</Badge>
                )}
              </div>
              <p className="text-muted text-xs mt-3">
                Attempts used: {attemptsUsed}
                {attemptsLeft > 0 ? ` · ${attemptsLeft} left` : ' · no attempts left'}
              </p>
              <div className="flex gap-2 mt-4">
                <Link href={`/student/quizzes/${quiz.id}`}>
                  <Button variant="outline" size="sm">
                    {inProgressAttemptId ? 'Resume' : hasSubmitted && attemptsLeft > 0 ? 'Retake' : 'View & start'}
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
