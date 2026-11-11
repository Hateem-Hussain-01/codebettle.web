import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { quizCreateSchema } from '@/lib/api-schemas';
import { createQuizForTeacher, listQuizzesForTeacher } from '@/lib/services/quiz-service';

/** GET /api/instructor/quizzes — list my quizzes (admin: all, instructor: own courses). */
export async function GET() {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const result = await listQuizzesForTeacher(auth.session);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ quizzes: result.quizzes });
}

/** POST /api/instructor/quizzes — create a draft quiz for my own course. */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = quizCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Course and title are required' }, { status: 400 });
  }
  const result = await createQuizForTeacher(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ quiz: result.quiz }, { status: 201 });
}
