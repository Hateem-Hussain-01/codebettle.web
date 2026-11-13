/**
 * Batch repository (course batches).
 *
 * A Batch is one run/cohort of a Course. The Course is the subject
 * (created once); each Batch is a dated run with its own instructor,
 * capacity and lifecycle (upcoming -> ongoing -> completed).
 *
 * FAIL-SAFE (same shape as the certificate-column fallback in
 * lib/db/certificates.ts): the Batch table arrives via migration
 * 20261113T1232_add_course_batches, which Eman runs himself in the
 * Supabase SQL Editor. Until it runs, the live DB has no Batch table
 * — reads catch the "relation does not exist" error and return
 * empty/null (batches UI shows a "run the SQL" state), and writes
 * return a clear error telling the admin to run the migration SQL
 * first. Existing course/enrolment flows keep working: they treat a
 * missing Batch table as "no batches yet".
 */
import { getDb } from './client';
import { mapBatchRow, stringToDate, stripUndefined } from './mappers';
import type { Batch, BatchStatus } from './types';

/** True when the error is "relation does not exist" for the Batch table (migration not run yet). */
export function isMissingBatchTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  const namesBatch = text.includes('"Batch"') || text.includes('Batch');
  if (code === '42P01' && namesBatch) return true;
  return /relation .* does not exist/i.test(text) && namesBatch;
}

/** A batch read that returns the fallback when the table is missing, instead of throwing. */
async function withBatchTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingBatchTableError(error)) return fallback;
    throw error;
  }
}

export async function getBatchById(id: string): Promise<Batch | null> {
  return withBatchTableFallback(async () => {
    const row = await getDb().orm.public.Batch.where({ id }).first();
    if (!row) return null;
    return mapBatchRow(row);
  }, null);
}

export async function getBatchesByCourse(courseId: string): Promise<Batch[]> {
  return withBatchTableFallback(async () => {
    const rows = await getDb()
      .orm.public.Batch.where({ courseId })
      .orderBy((b) => b.batchNumber.desc())
      .all();
    const counts = await enrollmentCounts(rows.map((r) => r.id));
    return rows.map((r) => mapBatchRow(r, counts.get(r.id) ?? 0));
  }, []);
}

/** The batch students should enrol in: the latest (highest-numbered) batch that is upcoming or ongoing. Null when there is no open batch. */
export async function getOpenBatchForCourse(courseId: string): Promise<Batch | null> {
  const batches = await getBatchesByCourse(courseId);
  return batches.find((b) => b.status === 'ongoing' || b.status === 'upcoming') ?? null;
}

/** Batches taught by one instructor (their own batches + students). */
export async function getBatchesByInstructor(instructorId: string): Promise<Batch[]> {
  return withBatchTableFallback(async () => {
    const rows = await getDb()
      .orm.public.Batch.where({ instructorId })
      .orderBy((b) => b.batchNumber.desc())
      .all();
    const counts = await enrollmentCounts(rows.map((r) => r.id));
    return rows.map((r) => mapBatchRow(r, counts.get(r.id) ?? 0));
  }, []);
}

/** Is this error a "column does not exist" failure for the given column? (Local copy of the certificates.ts helper — batches.ts must not import certificates.ts, which would create a cycle.) */
function isMissingBatchIdColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  const namesColumn = text.includes('"batchId"') || text.includes('batchId');
  if (code === '42703' && namesColumn) return true;
  return /column .* does not exist/i.test(text) && namesColumn;
}

/** Enrolment counts per batch id (0 for batches with no enrolments). Empty when the batchId column has not run yet. */
async function enrollmentCounts(batchIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (batchIds.length === 0) return counts;
  try {
    const rows = await getDb()
      .orm.public.Enrollment.where((e) => e.batchId.in(batchIds))
      .where((e) => e.deletedAt.isNull())
      .all();
    for (const row of rows) {
      if (!row.batchId) continue;
      counts.set(row.batchId, (counts.get(row.batchId) ?? 0) + 1);
    }
  } catch (error) {
    // The Batch table and the batchId column arrive in one migration,
    // so this only fires on a partial state — treat as "no counts".
    if (!isMissingBatchIdColumn(error)) throw error;
  }
  return counts;
}

/**
 * The certificate batch label for an enrolment ("BATCH-8"), resolved
 * from the enrolment's Batch. Null when the enrolment has no batch
 * (pre-batch enrolment) or the Batch table has not run yet.
 */
export async function getEnrollmentBatchLabel(enrollmentId: string): Promise<string | null> {
  try {
    const enrollment = await getDb()
      .orm.public.Enrollment.where({ id: enrollmentId })
      .where((e) => e.deletedAt.isNull())
      .first();
    if (!enrollment || !enrollment.batchId) return null;
    const batch = await getBatchById(enrollment.batchId);
    if (!batch) return null;
    return `BATCH-${batch.batchNumber}`;
  } catch (error) {
    if (isMissingBatchTableError(error) || isMissingBatchIdColumn(error)) return null;
    throw error;
  }
}

/** Next free batch number for a course (max + 1, or 1 when there are no batches yet). */
export async function nextBatchNumber(courseId: string): Promise<number> {
  const batches = await getBatchesByCourse(courseId);
  if (batches.length === 0) return 1;
  return Math.max(...batches.map((b) => b.batchNumber)) + 1;
}

export interface CreateBatchInput {
  courseId: string;
  /** Batch number. When omitted, the next free number (max + 1) is used. */
  batchNumber?: number;
  status?: BatchStatus;
  startDate?: string | null;
  endDate?: string | null;
  capacity?: number | null;
  instructorId?: string | null;
}

/** Create a batch. Fails clearly (not silently) when the migration has not run yet. */
export async function createBatch(input: CreateBatchInput): Promise<{ batch: Batch } | { error: string }> {
  const batchNumber = input.batchNumber ?? (await nextBatchNumber(input.courseId));
  if (!Number.isInteger(batchNumber) || batchNumber < 1) {
    return { error: 'Batch number must be a positive whole number' };
  }
  // Explicit duplicate check (the unique constraint is the backstop —
  // the check gives a clean error and works the same everywhere).
  const existing = await getBatchesByCourse(input.courseId);
  if (existing.some((b) => b.batchNumber === batchNumber)) {
    return { error: `Batch ${batchNumber} already exists for this course` };
  }
  try {
    const row = await getDb().orm.public.Batch.create({
      courseId: input.courseId,
      batchNumber,
      status: input.status ?? 'upcoming',
      startDate: stringToDate(input.startDate),
      endDate: stringToDate(input.endDate),
      capacity: input.capacity ?? null,
      instructorId: input.instructorId ?? null,
    });
    return { batch: mapBatchRow(row, 0) };
  } catch (error) {
    if (isMissingBatchTableError(error)) {
      return {
        error:
          'The batch migration has not run yet — run codebettle-batch-migration.sql in the Supabase SQL Editor, then try again.',
      };
    }
    // Unique (courseId, batchNumber) collision — a batch with this
    // number already exists for the course.
    const message = error instanceof Error ? error.message : String(error);
    if (/unique|duplicate/i.test(message)) {
      return { error: `Batch ${batchNumber} already exists for this course` };
    }
    throw error;
  }
}

export interface UpdateBatchInput {
  status?: BatchStatus;
  startDate?: string | null;
  endDate?: string | null;
  capacity?: number | null;
  instructorId?: string | null;
}

/** Update a batch (status, dates, capacity, instructor). Returns null when it does not exist. */
export async function updateBatch(id: string, input: UpdateBatchInput): Promise<Batch | null> {
  const data: Record<string, unknown> = {};
  if (input.status !== undefined) data.status = input.status;
  if (input.startDate !== undefined) data.startDate = stringToDate(input.startDate);
  if (input.endDate !== undefined) data.endDate = stringToDate(input.endDate);
  if (input.capacity !== undefined) data.capacity = input.capacity;
  if (input.instructorId !== undefined) data.instructorId = input.instructorId;
  const row = await getDb()
    .orm.public.Batch.where({ id })
    .update(stripUndefined(data));
  if (!row) return null;
  return getBatchById(id);
}

/** Delete a batch. Refused when students are enrolled in it (move them first). */
export async function deleteBatch(id: string): Promise<{ ok: true } | { error: string }> {
  const counts = await enrollmentCounts([id]);
  if ((counts.get(id) ?? 0) > 0) {
    return { error: 'This batch has enrolled students — move them to another batch first' };
  }
  const deleted = await getDb().orm.public.Batch.where({ id }).delete();
  if (!deleted) return { error: 'Batch not found' };
  return { ok: true };
}
