import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import {
  getSuccessStoryPublicUrl,
  verifySuccessStoryFile,
  SUCCESS_STORIES_BUCKET,
} from '@/lib/services/success-story-storage';
import { VIDEO_MIMES, MAX_VIDEO_BYTES } from '@/lib/success-story-validation';
import {
  SettingsValidationError,
  updateSiteSettings,
} from '@/lib/services/settings-service';
import { isVideoLayout, isVideoOrientation, isVideoPosition } from '@/lib/management';

/**
 * POST /api/admin/success-stories-management/video — save the page
 * video after a signed upload (admin only, `success-stories-management`
 * area). Body: { path } — the storage path returned by
 * /video-upload-url. The file is verified server-side first
 * (exists, video MIME, 100 MB max) and a client-supplied path is never
 * trusted. The public URL is saved as the `videoUrl` setting, so the
 * public page shows the video with no deploy. Body { path: null }
 * removes the video (placeholder returns).
 *
 * PATCH — save the video layout config: { layout?, position?,
 * orientation? }. The public page reads it from settings with no
 * deploy; invalid values are rejected (400).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('success-stories-management');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;
  if (v.path === null) {
    try {
      const settings = await updateSiteSettings({ videoUrl: '' });
      return NextResponse.json({ videoUrl: settings.videoUrl });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Could not remove the video' },
        { status: 500 },
      );
    }
  }
  if (typeof v.path !== 'string' || !v.path.startsWith('videos/')) {
    return NextResponse.json({ error: 'A valid uploaded video path is required' }, { status: 400 });
  }
  const info = await verifySuccessStoryFile(SUCCESS_STORIES_BUCKET, v.path);
  if (!info.exists) {
    return NextResponse.json({ error: 'The uploaded video could not be found — please upload it again' }, { status: 400 });
  }
  if (info.mime && !(VIDEO_MIMES as readonly string[]).includes(info.mime)) {
    return NextResponse.json({ error: 'The uploaded file is not a supported video type' }, { status: 400 });
  }
  if (info.size !== undefined && info.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: 'The video is larger than 100 MB' }, { status: 400 });
  }
  try {
    const url = getSuccessStoryPublicUrl(v.path);
    const settings = await updateSiteSettings({ videoUrl: url });
    return NextResponse.json({ videoUrl: settings.videoUrl, path: v.path });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not save the video' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminArea('success-stories-management');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;
  const patch: Record<string, string> = {};
  if (v.layout !== undefined) {
    if (!isVideoLayout(v.layout)) {
      return NextResponse.json({ error: 'Video layout must be side-by-side or vertical' }, { status: 400 });
    }
    patch.videoLayout = v.layout;
  }
  if (v.position !== undefined) {
    if (!isVideoPosition(v.position)) {
      return NextResponse.json({ error: 'Video position is not valid' }, { status: 400 });
    }
    patch.videoPosition = v.position;
  }
  if (v.orientation !== undefined) {
    if (!isVideoOrientation(v.orientation)) {
      return NextResponse.json({ error: 'Video orientation must be portrait or landscape' }, { status: 400 });
    }
    patch.videoOrientation = v.orientation;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No video layout settings provided' }, { status: 400 });
  }
  try {
    const settings = await updateSiteSettings(patch);
    return NextResponse.json({
      video: {
        videoUrl: settings.videoUrl,
        videoLayout: settings.videoLayout,
        videoPosition: settings.videoPosition,
        videoOrientation: settings.videoOrientation,
      },
    });
  } catch (e) {
    if (e instanceof SettingsValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not save the video layout' }, { status: 500 });
  }
}
