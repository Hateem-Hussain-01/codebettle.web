import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limit';
import { getCertificatesByStudent } from '@/lib/db/certificates';
import { getCourseCertificateInfo } from '@/lib/db/courses';
import { getSafeUserByEmail } from '@/lib/db/users';

/**
 * POST /api/certificates/lookup — public certificate lookup by email.
 *
 * Temporary pre-launch form (Eman, 28 Nov 2026): Batch 08 students get
 * their certificates by entering the email they enrolled with — no
 * login, no password. The page at /certificates posts here.
 *
 * Privacy: the response is deliberately the SAME whether the email has
 * no account or the account has no certificate — `{ status:
 * 'not_found' }` either way. An email on its own must not confirm that
 * the address is registered. Only when certificates exist do we return
 * anything: the student's name + their certificates (number, course,
 * batch, issued date, verification token for the download). The token
 * is the download capability — it is only ever returned for a matching
 * email, exactly like the verify page only answers for a matching
 * token. Revoked certificates are listed too, flagged revoked, and the
 * page offers no download for them (the download route still serves a
 * revoked certificate to its token holder, as today — the verify page
 * is the source of truth for validity).
 *
 * Abuse: 10 lookups / 15 min per IP + email (same shape as the login /
 * reset limiters). A wrong email costs one attempt, so guessing
 * addresses one by one is throttled.
 */
const lookupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }
  const email = parsed.data.email;
  const ip = getClientIp(request);
  const limit = await checkRateLimitAsync(`cert-lookup:${ip}:${email}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }
  try {
    const user = await getSafeUserByEmail(email);
    if (!user) return NextResponse.json({ status: 'not_found' });
    const certificates = await getCertificatesByStudent(user.id);
    if (certificates.length === 0) return NextResponse.json({ status: 'not_found' });
    const items = await Promise.all(
      certificates.map(async (certificate) => {
        const course = await getCourseCertificateInfo(certificate.courseId).catch(() => null);
        return {
          id: certificate.id,
          certificateNumber: certificate.certificateNumber,
          courseTitle: course?.title ?? 'CodeBettle course',
          batch: certificate.batch ?? null,
          issuedAt: certificate.issuedAt,
          revokedAt: certificate.revokedAt ?? null,
          verificationToken: certificate.verificationToken,
        };
      }),
    );
    return NextResponse.json({ status: 'found', studentName: user.name, certificates: items });
  } catch (error) {
    console.error('Certificate lookup failed:', error);
    return NextResponse.json({ error: 'Could not look up certificates. Please try again.' }, { status: 500 });
  }
}
