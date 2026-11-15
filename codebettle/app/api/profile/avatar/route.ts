import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, requireSession } from '@/lib/api-helpers';
import { checkRateLimit } from '@/lib/rate-limit';
import { updateUser } from '@/lib/db/users';
import { uploadAvatar } from '@/lib/services/avatar-storage';
import { isUploadValidationError } from '@/lib/services/file-validation';

/**
 * POST /api/profile/avatar — upload the signed-in user's profile photo.
 * multipart/form-data with a single `avatar` field. JPG/PNG/WebP/GIF,
 * 5 MB max. The photo goes to the public `avatars` bucket in Supabase
 * Storage and the public URL is saved to User.avatar, so the portal top
 * bar and sidebar pick it up on the next navigation.
 * Returns { user } (safe fields only).
 *
 * When the Supabase service-role key is not configured, this returns 503
 * with a plain message — never a stack trace, never the key. When the
 * `avatars` bucket does not exist yet in Supabase Storage, this returns
 * 503 naming the bucket (create it in the dashboard: Storage -> New
 * bucket -> `avatars`, Public).
 */
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  // U-3: logged-in uploads are rate-limited per user (10 per 15 min —
  // the same budget as the public application-file upload, which is
  // also a file upload that costs storage; keyed by user id, not IP,
  // because the actor is authenticated). Without this a student could
  // upload unlimited 5 MB avatars into Storage.
  const limit = checkRateLimit(`avatar-upload:${auth.session.id}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many photo uploads. Please try again later.' },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = form.get('avatar');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'A photo file is required' }, { status: 400 });
  }
  try {
    const { url } = await uploadAvatar(auth.session.id, {
      name: file.name,
      type: file.type,
      size: file.size,
      arrayBuffer: await file.arrayBuffer(),
    });
    const user = await updateUser(auth.session.id, { avatar: url });
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    return NextResponse.json({ user });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (
      message.includes('SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('Supabase URL is not set')
    ) {
      return NextResponse.json(
        { error: 'Photo uploads are not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    if (message.includes('Bucket not found')) {
      return NextResponse.json(
        { error: 'Photo uploads are not set up yet (the avatars bucket does not exist in Supabase Storage)' },
        { status: 503 },
      );
    }
    if (
      message.includes('Only JPG, PNG, WebP or GIF') ||
      message.includes('5 MB or smaller')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    // U-6: magic-byte mismatch / empty / unreadable file is a client
    // error (400 with the validation message), not a generic 500.
    if (isUploadValidationError(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Photo upload failed' }, { status: 500 });
  }
}
