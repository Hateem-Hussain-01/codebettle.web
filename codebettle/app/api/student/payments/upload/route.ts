import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/api-helpers';
import { uploadPaymentProof } from '@/lib/services/payment-proof-storage';

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
    return NextResponse.json({ error: 'Payment proof upload failed' }, { status: 500 });
  }
}
