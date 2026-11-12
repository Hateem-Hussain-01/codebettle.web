import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { revokeCertificate } from '@/lib/db/certificates';
import { logAudit } from '@/lib/db/audit';

/**
 * POST /api/admin/certificates/[id]/revoke — revoke a certificate (admin only).
 * Sets revokedAt to now; the verify page/API then show the certificate
 * as revoked/invalid. Idempotent: revoking an already-revoked
 * certificate returns it unchanged.
 * Needs the Phase 2 migration (revokedAt column): when the SQL has not
 * run yet the repository returns a clear error instead of pretending
 * the revoke worked (see revokeCertificate in lib/db/certificates.ts).
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('certificates');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const revoked = await revokeCertificate(id);
  if ('error' in revoked) {
    const status = revoked.error === 'Certificate not found' ? 404 : 500;
    return NextResponse.json({ error: revoked.error }, { status });
  }
  await logAudit({
    actorId: auth.session.id,
    action: 'certificate.revoke',
    entity: 'certificate',
    entityId: revoked.certificate.id,
    detail: revoked.certificate.certificateNumber,
  });
  return NextResponse.json({ certificate: revoked.certificate });
}
