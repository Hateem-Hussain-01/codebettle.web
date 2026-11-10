import { NextResponse } from 'next/server';
import { requireRoles, serviceError } from '@/lib/api-helpers';
import { listAvailableQuizzes } from '@/lib/services/quiz-service';

/** GET /api/student/quizzes — published quizzes for my enrolled courses. Key-free shapes only. */
export async function GET() {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const result = await listAvailableQuizzes(auth.session);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ quizzes: result.quizzes });
}
