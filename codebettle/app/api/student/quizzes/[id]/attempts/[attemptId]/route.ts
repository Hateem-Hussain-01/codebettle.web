import { NextRequest, NextResponse } from 'next/server';
import { requireRoles, serviceError } from '@/lib/api-helpers';
import { getAttemptForStudent } from '@/lib/services/quiz-service';

/** GET /api/student/quizzes/[id]/attempts/[attemptId] — my attempt, key-free quiz. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const { id, attemptId } = await params;
  const result = await getAttemptForStudent(auth.session, attemptId);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ attempt: result.attempt, quiz: result.quiz });
}
