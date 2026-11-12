import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { quizQuestionsSchema } from '@/lib/api-schemas';
import { saveQuizQuestions } from '@/lib/services/quiz-service';

/**
 * POST /api/instructor/quizzes/[id]/questions — save the teacher's
 * edited questions for a draft quiz (manual add/edit, or fixes to
 * imported questions). Draft only. Questions whose answer key is
 * missing or wrong come back flagged, so the teacher can see what
 * still needs fixing — the flag never blocks publishing by itself.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = quizQuestionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A list of questions is required' }, { status: 400 });
  }
  const result = await saveQuizQuestions(auth.session, id, parsed.data.questions);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ quiz: result.quiz });
}
