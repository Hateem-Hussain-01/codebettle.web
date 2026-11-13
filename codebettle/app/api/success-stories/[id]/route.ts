import { NextResponse } from 'next/server';
import { getPublicSuccessStory } from '@/lib/services/success-story-service';

/**
 * GET /api/success-stories/[id] — one approved story, public fields
 * only. Pending / under-review / rejected stories are never exposed
 * (404), and neither are email, admin notes or private evidence paths.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const story = await getPublicSuccessStory(id);
  if (!story) {
    return NextResponse.json({ error: 'Story not found' }, { status: 404 });
  }
  return NextResponse.json({ story });
}
