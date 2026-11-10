import { NextRequest, NextResponse } from 'next/server';
import { requireRoles, serviceError } from '@/lib/api-helpers';
import { listMyAttempts } from '@/lib/services/quiz-service';

/** GET /api/student/quizzes/[id] — my attempts for this quiz. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await listMyAttempts(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ attempts: result.attempts });
}
