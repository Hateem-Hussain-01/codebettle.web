import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, requireRoles } from '@/lib/api-helpers';
import { checkRateLimit } from '@/lib/rate-limit';
import { uploadPaymentProof } from '@/lib/services/payment-proof-storage';
import { isUploadValidationError } from '@/lib/services/file-validation';

/**
 * POST /api/student/payments/upload — upload a transaction
 * screenshot/receipt for a payment submission (Phase 1b). Student-only.
 * Multipart form-data with a single `file` field (PNG/JPEG/WebP/PDF,
 * max 5 MB). The file goes to the PRIVATE `payment-proofs` bucket;
 * the response is the storage path, which the client then passes as
 * `proofPath` to POST /api/student/payments. A missing service-role
 * key is a 503 with a plain message (same as the other upload routes);
 * a missing bucket surfaces as a 500 from the storage client.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  // U-3: logged-in uploads are rate-limited per user (10 per 15 min —
  // the same budget as the public application-file upload, which is
  // also a file upload that costs storage; keyed by user id, not IP,
  // because the actor is authenticated). Without this a student could
  // upload unlimited 5 MB payment proofs into Storage.
  const limit = checkRateLimit(`payment-proof-upload:${auth.session.id}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads. Please try again later.' },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a file upload' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'A payment proof file is required' }, { status: 400 });
  }
  try {
    const { path } = await uploadPaymentProof({
      name: file.name,
      type: file.type,
      size: file.size,
      arrayBuffer: () => file.arrayBuffer(),
    });
    return NextResponse.json({ path });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (
      message.includes('SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('Supabase URL is not set')
    ) {
      return NextResponse.json(
        { error: 'Payment proof uploads are not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    if (message.includes('Only PNG') || message.includes('5 MB or smaller')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    // U-6: magic-byte mismatch / empty / unreadable file is a client
    // error (400 with the validation message), not a generic 500.
    if (isUploadValidationError(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Payment proof upload failed' }, { status: 500 });
  }
}
