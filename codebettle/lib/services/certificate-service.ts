/**
 * Certificate issuing service (Phase 4).
 *
 * Owns certificate-number generation. Numbers are CB-<year>-<seq>,
 * zero-padded to 3 digits, seq starting at (current count + 1). The old
 * route generated the number inline with no retry, so two near-simultaneous
 * issues (or a count that no longer matched the highest used number)
 * could collide on the unique certificateNumber constraint. This service
 * checks getCertificateByNumber before creating and retries with the next
 * seq when the number is taken — including when the create itself throws
 * (unique violation on the real DB; the test fake does not enforce unique
 * constraints, so the existence check is what tests exercise).
 *
 * The low-level create stays in lib/db/certificates.ts (issueCertificate);
 * this is the retry wrapper around it. No Next.js imports — unit-testable
 * with the fake db.
 */
import { countCertificates, getCertificateByNumber, issueCertificate } from '../db/certificates';
import type { Certificate } from '../db/types';
import { badRequest, type ServiceError } from './errors';

type Result<T> = T | ServiceError;

export interface IssueCertificateWithRetryInput {
  studentId: string;
  courseId: string;
  enrollmentId: string;
  /** When given, this exact number is used (single attempt, no retry). */
  certificateNumber?: string;
}

export interface IssueCertificateWithRetryOptions {
  maxAttempts?: number;
}

function formatNumber(year: number, seq: number): string {
  return `CB-${year}-${String(seq).padStart(3, '0')}`;
}

/** Is this issueCertificate failure a duplicate certificate for the enrolment (not a number collision)? */
function isDuplicateCertificateError(error: string): boolean {
  return error === 'A certificate already exists for this enrollment';
}

export async function issueCertificateWithRetry(
  input: IssueCertificateWithRetryInput,
  options: IssueCertificateWithRetryOptions = {},
): Promise<Result<{ certificate: Certificate }>> {
  const maxAttempts = options.maxAttempts ?? 5;

  // An explicitly requested number is used as-is: inventing a different
  // number than the admin asked for would be worse than failing loudly.
  if (input.certificateNumber !== undefined) {
    const issued = await issueCertificate({
      studentId: input.studentId,
      courseId: input.courseId,
      enrollmentId: input.enrollmentId,
      certificateNumber: input.certificateNumber,
    });
    if ('error' in issued) return badRequest(issued.error);
    return { certificate: issued.certificate };
  }

  const year = new Date().getFullYear();
  let seq = (await countCertificates()) + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const certificateNumber = formatNumber(year, seq);
    // Existence check first: cheap, and the only collision signal the
    // test fake (no unique enforcement) can produce.
    const taken = await getCertificateByNumber(certificateNumber);
    if (taken) {
      seq += 1;
      continue;
    }
    let issued: Awaited<ReturnType<typeof issueCertificate>>;
    try {
      issued = await issueCertificate({ ...input, certificateNumber });
    } catch {
      // Real-DB unique violation (or any create failure that looks like a
      // collision): try the next number instead of failing the issue.
      seq += 1;
      continue;
    }
    if ('error' in issued) {
      // A duplicate certificate for this enrolment, a missing enrolment,
      // or a not-completed enrolment will not be fixed by another number.
      if (isDuplicateCertificateError(issued.error)) return badRequest(issued.error);
      return badRequest(issued.error);
    }
    return { certificate: issued.certificate };
  }
  return {
    error: `Could not generate a unique certificate number after ${maxAttempts} attempts`,
    status: 409,
  };
}
