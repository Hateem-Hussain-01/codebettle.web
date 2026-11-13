import { NextRequest, NextResponse } from 'next/server';
import { getBatchesByCourse } from '@/lib/db/batches';
import { getCourseById } from '@/lib/db/courses';

/**
 * GET /api/courses/[id]/batches — public batch list for a course page.
 * The open batch (latest upcoming/ongoing) is what students enrol in;
 * completed batches are shown as history. No student data — only the
 * batch's own fields plus the enrolled count.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await getCourseById(id);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  const batches = await getBatchesByCourse(id);
  return NextResponse.json({ batches });
}
