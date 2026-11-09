/**
 * Certificate repository (Phase 2, Prisma-backed).
 *
 * Same function names as the old lib/data/certificates.ts. Certificates
 * are issued against a completed enrolment; the verification token is a
 * random 32-hex string generated at issue time (seed tokens were
 * generated the same way). Issue is admin-only (enforced in the route).
 */
import { randomBytes } from 'node:crypto';
import { getDb } from './client';
import { mapCertificateRow } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type { Certificate } from './types';

export async function getCertificatesByStudent(studentId: string): Promise<Certificate[]> {
  const rows = await getDb()
    .orm.public.Certificate.where({ studentId })
    .orderBy((c) => c.issuedAt.desc())
    .all();
  return rows.map(mapCertificateRow);
}

export async function getCertificateByCourseAndStudent(
  courseId: string,
  studentId: string,
): Promise<Certificate | null> {
  const row = await getDb()
    .orm.public.Certificate.where({ courseId, studentId })
    .first();
  if (!row) return null;
  return mapCertificateRow(row);
}

export async function getCertificateByNumber(
  certificateNumber: string,
): Promise<Certificate | null> {
  const row = await getDb()
    .orm.public.Certificate.where({ certificateNumber })
    .first();
  if (!row) return null;
  return mapCertificateRow(row);
}

export interface ListCertificatesOptions {
  studentId?: string;
  courseId?: string;
  page?: string | string[];
  limit?: string | string[];
}

/** Paginated certificate list (admin). */
export async function listCertificates(opts: ListCertificatesOptions = {}): Promise<Page<Certificate>> {
  const params = parsePageParams({ page: opts.page, limit: opts.limit });
  let query = getDb().orm.public.Certificate;
  if (opts.studentId) query = query.where({ studentId: opts.studentId });
  if (opts.courseId) query = query.where({ courseId: opts.courseId });
  const total = (await query.all()).length;
  const rows = await query.orderBy((c) => c.issuedAt.desc()).limit(params.limit).offset(params.offset).all();
  return toPage(rows.map(mapCertificateRow), total, params);
}

/** Total certificate count — used to generate the next CB-<year>-<seq> number. */
export async function countCertificates(): Promise<number> {
  const rows = await getDb().orm.public.Certificate.all();
  return rows.length;
}

export interface IssueCertificateInput {
  studentId: string;
  courseId: string;
  enrollmentId: string;
  certificateNumber: string;
}

/** Issue a certificate for a completed enrolment. */
export async function issueCertificate(
  input: IssueCertificateInput,
): Promise<{ certificate: Certificate } | { error: string }> {
  const enrollment = await getDb()
    .orm.public.Enrollment.where({ id: input.enrollmentId })
    .where((e) => e.deletedAt.isNull())
    .first();
  if (!enrollment) return { error: 'Enrollment not found' };
  if (!enrollment.isCompleted) return { error: 'Course is not completed yet' };
  if (enrollment.studentId !== input.studentId || enrollment.courseId !== input.courseId) {
    return { error: 'Enrollment does not match this student and course' };
  }
  const existing = await getDb()
    .orm.public.Certificate.where({ enrollmentId: input.enrollmentId })
    .first();
  if (existing) return { error: 'A certificate already exists for this enrollment' };
  const row = await getDb().orm.public.Certificate.create({
    studentId: input.studentId,
    courseId: input.courseId,
    enrollmentId: input.enrollmentId,
    certificateNumber: input.certificateNumber,
    verificationToken: randomBytes(16).toString('hex'),
  });
  return { certificate: mapCertificateRow(row) };
}
