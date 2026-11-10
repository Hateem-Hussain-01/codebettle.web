/**
 * Data integrity summary (Phase 4, admin-only read).
 *
 * Cross-checks the tables for inconsistencies that should never happen
 * through the normal flows (soft-deleted owners, paid-but-free enrolments,
 * certificates on incomplete enrolments, reviews pointing at missing
 * records). Returns counts plus up to 10 example ids per check so an admin
 * can find the offending rows. Read-only: nothing is written or fixed here.
 * No Next.js imports — unit-testable with the fake db.
 */
import { listCertificates } from '../db/certificates';
import { getCourseById } from '../db/courses';
import { getEnrollmentById, listEnrollments } from '../db/enrollments';
import { listReviews } from '../db/reviews';
import { getUserById } from '../db/users';

const MAX_EXAMPLES = 10;

export interface IntegrityCheck {
  count: number;
  exampleIds: string[];
}

export interface IntegritySummary {
  enrolmentsWithDeletedStudentOrCourse: IntegrityCheck;
  enrolmentsPaidButFree: IntegrityCheck;
  certificatesForIncompleteEnrolments: IntegrityCheck;
  reviewsWithMissingStudentOrCourse: IntegrityCheck;
  checkedAt: string;
}

function toCheck(ids: string[]): IntegrityCheck {
  return { count: ids.length, exampleIds: ids.slice(0, MAX_EXAMPLES) };
}

async function allEnrolments() {
  const out = [];
  let page = 1;
  for (;;) {
    const result = await listEnrollments({ page: String(page), limit: '100' });
    out.push(...result.items);
    if (!result.hasNext) break;
    page++;
  }
  return out;
}

async function allCertificates() {
  const out = [];
  let page = 1;
  for (;;) {
    const result = await listCertificates({ page: String(page), limit: '100' });
    out.push(...result.items);
    if (!result.hasNext) break;
    page++;
  }
  return out;
}

export async function getIntegritySummary(): Promise<IntegritySummary> {
  const enrolments = await allEnrolments();
  const certificates = await allCertificates();
  const reviews = await listReviews();

  // Cache owner lookups: getUserById/getCourseById return null for
  // soft-deleted records, which is exactly the "missing" signal here.
  const userCache = new Map<string, boolean>();
  const courseCache = new Map<string, boolean>();
  const userExists = async (id: string): Promise<boolean> => {
    if (!userCache.has(id)) userCache.set(id, (await getUserById(id)) !== null);
    return userCache.get(id) as boolean;
  };
  const courseExists = async (id: string): Promise<boolean> => {
    if (!courseCache.has(id)) courseCache.set(id, (await getCourseById(id)) !== null);
    return courseCache.get(id) as boolean;
  };

  const deletedOwnerIds: string[] = [];
  const paidButFreeIds: string[] = [];
  for (const enrolment of enrolments) {
    const studentOk = await userExists(enrolment.studentId);
    const courseOk = await courseExists(enrolment.courseId);
    if (!studentOk || !courseOk) deletedOwnerIds.push(enrolment.id);
    if (enrolment.amountPaid > 0 && enrolment.paymentStatus === 'free') {
      paidButFreeIds.push(enrolment.id);
    }
  }

  const incompleteCertIds: string[] = [];
  for (const certificate of certificates) {
    const enrolment = await getEnrollmentById(certificate.enrollmentId);
    if (!enrolment || !enrolment.isCompleted) incompleteCertIds.push(certificate.id);
  }

  const orphanReviewIds: string[] = [];
  for (const review of reviews) {
    const studentOk = await userExists(review.studentId);
    const courseOk = await courseExists(review.courseId);
    if (!studentOk || !courseOk) orphanReviewIds.push(review.id);
  }

  return {
    enrolmentsWithDeletedStudentOrCourse: toCheck(deletedOwnerIds),
    enrolmentsPaidButFree: toCheck(paidButFreeIds),
    certificatesForIncompleteEnrolments: toCheck(incompleteCertIds),
    reviewsWithMissingStudentOrCourse: toCheck(orphanReviewIds),
    checkedAt: new Date().toISOString(),
  };
}
