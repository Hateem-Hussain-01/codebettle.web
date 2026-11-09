import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/api-helpers';
import { uploadBlogPdf } from '@/lib/services/blog-storage';

/**
 * POST /api/admin/blog/upload — upload a blog PDF (admin or instructor).
 * multipart/form-data with a single `file` field. PDF only, 10 MB max.
 * Returns { url, path }: store the url as the post's pdfUrl; keep the path
 * if the file ever needs deleting from Storage.
 *
 * When the Supabase service-role key is not configured, this returns 503
 * with a plain message — never a stack trace, never the key.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 });
  }
  try {
    const { url, path } = await uploadBlogPdf({
      name: file.name,
      type: file.type,
      size: file.size,
      arrayBuffer: await file.arrayBuffer(),
    });
    return NextResponse.json({ url, path });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message.includes('SUPABASE_SERVICE_ROLE_KEY') || message.includes('Supabase URL is not set')) {
      return NextResponse.json(
        { error: 'Blog PDF uploads are not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    if (message.includes('Only PDF files are allowed') || message.includes('10 MB or smaller')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Blog PDF upload failed' }, { status: 500 });
  }
}
