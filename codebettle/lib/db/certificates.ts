/**
 * Certificate repository (Phase 2, Prisma-backed).
 *
 * Same function names as the old lib/data/certificates.ts. Certificates
 * are issued against a completed enrolment; the verification token is a
 * random 32-hex string generated at issue time (seed tokens were
 * generated the same way). Issue is admin-only (enforced in the route).
 *
 * FAIL-SAFE (Phase 2 migration): the `batch` and `revokedAt` columns
 * arrive via migration 20261112T1945_add_certificate_batch_revoked_at,
 * which Eman runs himself in the Supabase SQL Editor. Until it runs,
 * the live table has neither column — but the generated client selects
 * them, so a plain lookup would throw Postgres 42703 (undefined
 * column). The public read paths (getCertificateByToken,
 * getCertificateById) catch exactly that error and retry selecting
 * only the pre-migration columns, treating the certificate as
 * "no batch / not revoked" — the same fail-safe shape as the settings
 * service (lib/services/settings-service.ts). The revoke write is the
 * exception: it needs the column and fails with a clear message
 * (see revokeCertificate) instead of pretending it worked.
 */
import { randomBytes } from 'node:crypto';
import { getDb } from './client';
import { mapCertificateRow } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type { Certificate } from './types';

/** Columns that existed before the Phase 2 migration (batch/revokedAt excluded). */
const LEGACY_CERTIFICATE_FIELDS = [
  'id',
  'studentId',
  'courseId',
  'enrollmentId',
  'certificateNumber',
  'verificationToken',
  'issuedAt',
] as const;

/**
 * Is this error a "column does not exist" failure for one of the given
 * columns? Postgres reports it as code 42703 with a message naming the
 * column. Anything else is a real failure and must propagate.
 */
export function isMissingColumnError(error: unknown, columns: string[]): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  const namesColumn = columns.some((c) => text.includes(`"${c}"`) || text.includes(c));
  if (code === '42703' && namesColumn) return true;
  return /column .* does not exist/i.test(text) && namesColumn;
}

/** Phase 2 Certificate columns — the ones a pre-migration table lacks. */
const PHASE2_CERTIFICATE_COLUMNS = ['batch', 'revokedAt'];

/**
 * Run a certificate read, retrying without the Phase 2 columns when the
 * migration has not run yet. `fetch` receives a query builder flag and
 * returns the raw result (row, rows, or null).
 */
async function withCertificateColumnFallback<T>(
  fetch: (legacyOnly: boolean) => Promise<T>,
): Promise<T> {
  try {
    return await fetch(false);
  } catch (error) {
    if (!isMissingColumnError(error, PHASE2_CERTIFICATE_COLUMNS)) throw error;
    return fetch(true);
  }
}

export async function getCertificateById(id: string): Promise<Certificate | null> {
  const row = await withCertificateColumnFallback(async (legacyOnly) => {
    const base = getDb().orm.public.Certificate.where({ id });
    // Separate branches (not a reassigned `let`): .select() narrows the
    // collection's row type, so assigning it back is a type error.
    return legacyOnly
      ? base.select(...LEGACY_CERTIFICATE_FIELDS).first()
      : base.first();
  });
  if (!row) return null;
  return mapCertificateRow(row);
}

export async function getCertificatesByStudent(studentId: string): Promise<Certificate[]> {
  const rows = await withCertificateColumnFallback(async (legacyOnly) => {
    const base = getDb().orm.public.Certificate.where({ studentId });
    return legacyOnly
      ? base.select(...LEGACY_CERTIFICATE_FIELDS).orderBy((c) => c.issuedAt.desc()).all()
      : base.orderBy((c) => c.issuedAt.desc()).all();
  });
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

/**
 * Fetch one student's certificates for several courses in ONE query
 * (Phase 7 perf — the student courses page used to ask once per
 * enrolment). Unknown / missing courses are simply absent.
 */
export async function getCertificatesByStudentAndCourses(
  studentId: string,
  courseIds: string[],
): Promise<Certificate[]> {
  const unique = [...new Set(courseIds)];
  if (unique.length === 0) return [];
  const rows = await withCertificateColumnFallback(async (legacyOnly) => {
    const base = getDb()
      .orm.public.Certificate.where({ studentId })
      .where((c) => c.courseId.in(unique));
    return legacyOnly
      ? base.select(...LEGACY_CERTIFICATE_FIELDS).orderBy((c) => c.issuedAt.desc()).all()
      : base.orderBy((c) => c.issuedAt.desc()).all();
  });
  return rows.map(mapCertificateRow);
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

/** Look up a certificate by its verification token (public verify page). Fail-safe: see the header note. */
export async function getCertificateByToken(
  verificationToken: string,
): Promise<Certificate | null> {
  const row = await withCertificateColumnFallback(async (legacyOnly) => {
    const base = getDb().orm.public.Certificate.where({ verificationToken });
    return legacyOnly
      ? base.select(...LEGACY_CERTIFICATE_FIELDS).first()
      : base.first();
  });
  if (!row) return null;
  return mapCertificateRow(row);
}

/**
 * Revoke a certificate (admin only). Sets revokedAt to now; the verify
 * page/API then show it as revoked/invalid. Idempotent: revoking an
 * already-revoked certificate returns it unchanged.
 *
 * This write NEEDS the Phase 2 migration: unlike the reads above it
 * cannot fall back, so a missing revokedAt column surfaces as a clear
 * error telling the admin to run the migration SQL first — never a
 * silent success.
 */
export async function revokeCertificate(
  id: string,
): Promise<{ certificate: Certificate } | { error: string }> {
  const existing = await getCertificateById(id);
  if (!existing) return { error: 'Certificate not found' };
  if (existing.revokedAt) return { certificate: existing };
  try {
    const updated = await getDb()
      .orm.public.Certificate.where({ id })
      .update({ revokedAt: new Date() });
    if (!updated) return { error: 'Certificate not found' };
    return { certificate: mapCertificateRow(updated) };
  } catch (error) {
    if (isMissingColumnError(error, PHASE2_CERTIFICATE_COLUMNS)) {
      return {
        error:
          'The certificate migration has not run yet — run codebettle-certificate-migration.sql in the Supabase SQL Editor, then try revoking again.',
      };
    }
    throw error;
  }
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
  /** Cohort batch printed on the certificate (e.g. "BATCH-8"). Optional. */
  batch?: string;
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
    ...(input.batch ? { batch: input.batch } : {}),
  });
  return { certificate: mapCertificateRow(row) };
}
