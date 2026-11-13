import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, requireFullAdmin } from '@/lib/api-helpers';
import {
  createAdminSuccessStory,
  listAdminSuccessStories,
} from '@/lib/services/success-story-service';
import { areSuccessStoryTablesReady } from '@/lib/db/success-stories';
import { SUCCESS_STORY_LIMITS } from '@/lib/success-story-validation';

/**
 * GET /api/admin/success-stories-management/stories — the stories the
 * management tab shows (all statuses, for visibility/ordering).
 * POST — add a story directly as an admin (created already approved,
 * marked adminCreated). Guard: requireAdminArea
 * ('success-stories-management').
 */
export async function GET() {
  const auth = await requireAdminArea('success-stories-management');
  if ('error' in auth) return auth.error;
  const [result, tablesReady] = await Promise.all([
    listAdminSuccessStories({ limit: 100 }),
    areSuccessStoryTablesReady(),
  ]);
  return NextResponse.json({ submissions: result.items, total: result.total, tablesReady });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('success-stories-management');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;
  const str = (key: string): string => (typeof v[key] === 'string' ? v[key].trim() : '');
  const error =
    !str('fullName')
      ? 'Full name is required'
      : str('fullName').length > SUCCESS_STORY_LIMITS.fullName
        ? 'Full name is too long'
        : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str('email'))
          ? 'A valid email is required'
          : !str('country')
            ? 'Country is required'
            : !str('courseTitle')
              ? 'Course is required'
              : !str('skillsLearned')
                ? 'Skills learned are required'
                : !str('experience')
                  ? 'Experience is required'
                  : !str('story')
                    ? 'Story is required'
                    : null;
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const submission = await createAdminSuccessStory({
      fullName: str('fullName'),
      email: str('email'),
      country: str('country'),
      city: str('city') || null,
      designation: str('designation') || null,
      courseTitle: str('courseTitle'),
      batchNumber: typeof v.batchNumber === 'number' ? v.batchNumber : null,
      skillsLearned: str('skillsLearned'),
      experience: str('experience'),
      story: str('story'),
      profilePicturePath: typeof v.profilePicturePath === 'string' ? v.profilePicturePath : null,
      linkedinUrl: str('linkedinUrl') || null,
      videoPath: typeof v.videoPath === 'string' ? v.videoPath : null,
      videoUrl: str('videoUrl') || null,
      featured: v.featured === true,
    });
    return NextResponse.json({ submission }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not add the story';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not add the story' }, { status: 500 });
  }
}
