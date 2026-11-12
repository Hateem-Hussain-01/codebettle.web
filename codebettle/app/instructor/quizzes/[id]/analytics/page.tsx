import { connection } from 'next/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getQuizAnalytics, getQuizForTeacher } from '@/lib/services/quiz-service';
import Card from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';
import Button from '@/components/ui/Button';
import FadeIn from '@/components/ui/FadeIn';
import { FileCheck, Target, TrendingUp, Users } from 'lucide-react';

export default async function QuizAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const session = await getSession();
  if (!session) redirect('/auth/login');
  const { id } = await params;
  // Phase 2: pass the flags through so the quiz service sees the real capabilities.
  const actor = { id: session.id, role: session.role as 'admin' | 'instructor', name: session.name, isAdmin: session.isAdmin, isTeacher: session.isTeacher };
  const [quizResult, analyticsResult] = await Promise.all([
    getQuizForTeacher(actor, id),
    getQuizAnalytics(actor, id),
  ]);
  if ('error' in quizResult || 'error' in analyticsResult) notFound();
  const quiz = quizResult.quiz;
  const a = analyticsResult.analytics;

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">Analytics — {quiz.title}</h1>
          <p className="text-muted text-sm mt-1">
            {a.submittedAttempts} submitted attempt{a.submittedAttempts !== 1 ? 's' : ''} ·{' '}
            {a.uniqueStudents} student{a.uniqueStudents !== 1 ? 's' : ''} · average{' '}
            {a.averageScore === null ? '—' : `${a.averageScore.toFixed(1)} / ${a.totalPoints}`} · pass rate{' '}
            {a.passRate === null ? '—' : `${a.passRate.toFixed(0)}%`}
          </p>
        </div>
        <Link href={`/instructor/quizzes/${quiz.id}`}>
          <Button variant="outline" size="sm">
            Back to quiz
          </Button>
        </Link>
      </FadeIn>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Submitted" value={String(a.submittedAttempts)} icon={<FileCheck className="w-5 h-5" />} />
        <StatCard title="Students" value={String(a.uniqueStudents)} icon={<Users className="w-5 h-5" />} />
        <StatCard title="Average score" value={a.averageScore === null ? '—' : `${a.averageScore.toFixed(1)} / ${a.totalPoints}`} icon={<TrendingUp className="w-5 h-5" />} />
        <StatCard title="Pass rate" value={a.passRate === null ? '—' : `${a.passRate.toFixed(0)}%`} icon={<Target className="w-5 h-5" />} />
      </div>

      <FadeIn delay={0.1}>
      <Card className="p-5">
        <h2 className="text-foreground font-bold mb-4">Per-question accuracy</h2>
        {a.perQuestion.length === 0 ? (
          <p className="text-muted text-sm">No questions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-dark-border">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Question</th>
                  <th className="py-2 pr-3">Points</th>
                  <th className="py-2 pr-3">Answered</th>
                  <th className="py-2">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {a.perQuestion.map((q) => (
                  <tr key={q.questionId} className="border-b border-dark-border/50">
                    <td className="py-2 pr-3 text-foreground">{q.position}</td>
                    <td className="py-2 pr-3 text-foreground">{q.prompt}</td>
                    <td className="py-2 pr-3 text-muted">{q.points}</td>
                    <td className="py-2 pr-3 text-muted">{q.attempts}</td>
                    <td className="py-2 text-foreground">{q.accuracy === null ? '—' : `${q.accuracy.toFixed(0)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </FadeIn>

      <FadeIn delay={0.15}>
      <Card className="p-5">
        <h2 className="text-foreground font-bold mb-4">Per-student results</h2>
        {a.perStudent.length === 0 ? (
          <p className="text-muted text-sm">No submissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-dark-border">
                  <th className="py-2 pr-3">Student</th>
                  <th className="py-2 pr-3">Attempts</th>
                  <th className="py-2 pr-3">Best score</th>
                  <th className="py-2">Latest score</th>
                </tr>
              </thead>
              <tbody>
                {a.perStudent.map((s) => (
                  <tr key={s.studentId} className="border-b border-dark-border/50">
                    <td className="py-2 pr-3 text-foreground">{s.studentName}</td>
                    <td className="py-2 pr-3 text-muted">{s.attempts}</td>
                    <td className="py-2 pr-3 text-foreground">{s.bestScore ?? '—'}</td>
                    <td className="py-2 text-foreground">{s.latestScore ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </FadeIn>

      {a.byTopic.length > 0 && (
        <FadeIn delay={0.2}>
        <Card className="p-5">
          <h2 className="text-foreground font-bold mb-4">By topic</h2>
          <div className="space-y-2">
            {a.byTopic.map((t) => (
              <div key={t.topic} className="flex justify-between text-sm">
                <span className="text-foreground">{t.topic}</span>
                <span className="text-muted">
                  {t.accuracy === null ? '—' : `${t.accuracy.toFixed(0)}%`} ({t.attempts} answered)
                </span>
              </div>
            ))}
          </div>
        </Card>
        </FadeIn>
      )}
    </div>
  );
}
