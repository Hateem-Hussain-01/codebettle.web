import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { uploadNavbarLogoImage } from '@/lib/services/course-image-storage';
import { SettingsValidationError, updateSiteSettings } from '@/lib/services/settings-service';

/**
 * POST /api/admin/navbar-editor/logo — "Change Logo" (admin only,
 * `navbar-editor` area): multipart/form-data with a single `logo`
 * field. JPG/PNG/WebP only, 2 MB max (validated server-side). The
 * image goes to the public `course-images` bucket
 * (`brand/<uuid>.<ext>`) and the returned public URL is saved as the
 * `navbarLogoUrl` setting, so the navbar shows the new logo with no
 * deploy. Returns { url, path }.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('navbar-editor');
  if ('error' in auth) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = form.get('logo');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'A logo image file is required' }, { status: 400 });
  }
  try {
    const { url, path } = await uploadNavbarLogoImage({
      name: file.name,
      type: file.type,
      size: file.size,
      arrayBuffer: await file.arrayBuffer(),
    });
    await updateSiteSettings({ navbarLogoUrl: url });
    return NextResponse.json({ url, path });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (e instanceof SettingsValidationError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (
      message.includes('SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('Supabase URL is not set')
    ) {
      return NextResponse.json(
        { error: 'Logo uploads are not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    if (message.includes('Bucket not found')) {
      return NextResponse.json(
        { error: 'Logo uploads are not set up yet (the course-images bucket does not exist in Supabase Storage)' },
        { status: 503 },
      );
    }
    if (message.includes('Only JPG, PNG or WebP') || message.includes('2 MB or smaller')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Logo upload failed' }, { status: 500 });
  }
}
