import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { getPaymentSubmissionById } from '@/lib/db/payments';
import { createPaymentProofSignedUrl } from '@/lib/services/payment-proof-storage';

/**
 * GET /api/admin/payments/[id]/proof — mint a short-lived signed URL
 * (1 hour) for a submission's payment proof, so an admin can
 * view/download the screenshot from the PRIVATE `payment-proofs`
 * bucket. Admin only, `enrollments` area. The stored proofUrl is the
 * storage path, not a public URL, so it must go through here.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('enrollments');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const submission = await getPaymentSubmissionById(id);
  if (!submission) return NextResponse.json({ error: 'Payment submission not found' }, { status: 404 });
  if (!submission.proofUrl) {
    return NextResponse.json({ error: 'No payment proof was uploaded for this submission' }, { status: 404 });
  }
  try {
    const url = await createPaymentProofSignedUrl(submission.proofUrl);
    return NextResponse.json({ url });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (
      message.includes('SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('Supabase URL is not set')
    ) {
      return NextResponse.json(
        { error: 'File access is not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Could not open the file' }, { status: 500 });
  }
}
