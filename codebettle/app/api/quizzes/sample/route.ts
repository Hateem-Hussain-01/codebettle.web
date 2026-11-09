import { NextResponse } from 'next/server';
import { generateSampleQuizPdf } from '@/lib/services/quiz-sample-pdf';

/**
 * GET /api/quizzes/sample — download the sample quiz PDF that shows the
 * format teachers should follow when they generate a quiz PDF with an
 * external AI. Generated in code, so the format and the parser always agree.
 */
export async function GET() {
  const pdf = generateSampleQuizPdf();
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="codebettle-sample-quiz.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
