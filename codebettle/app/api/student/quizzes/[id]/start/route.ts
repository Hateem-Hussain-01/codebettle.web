import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, requireRoles, serviceError } from '@/lib/api-helpers';
import { startAttempt } from '@/lib/services/quiz-service';

/**
 * POST /api/student/quizzes/[id]/start — start a new attempt, or resume
 * the in-progress one. The response quiz is the public (key-free) shape.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;
  const result = await startAttempt(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ attempt: result.attempt, quiz: result.quiz }, { status: 201 });
}
