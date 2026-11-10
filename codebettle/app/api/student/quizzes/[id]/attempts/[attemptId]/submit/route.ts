import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { quizSubmitSchema } from '@/lib/api-schemas';
import { submitAttempt } from '@/lib/services/quiz-service';

/**
 * POST /api/student/quizzes/[id]/attempts/[attemptId]/submit — submit my
 * answers. Graded server-side; the timer is enforced server-side too
 * (30-second late grace, then flagged submittedLate). Exact-selection
 * counts are enforced here — a bad count is a 400, not a silent 0.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const { attemptId } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = quizSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A list of answers is required' }, { status: 400 });
  }
  const result = await submitAttempt(auth.session, attemptId, parsed.data.answers);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ result: result.result });
}
