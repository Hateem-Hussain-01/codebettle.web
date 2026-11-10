import { NextRequest, NextResponse } from 'next/server';
import { requireRoles, serviceError } from '@/lib/api-helpers';
import { getQuizAnalytics } from '@/lib/services/quiz-service';

/** GET /api/instructor/quizzes/[id]/analytics — per-question and per-student results. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await getQuizAnalytics(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ analytics: result.analytics });
}
