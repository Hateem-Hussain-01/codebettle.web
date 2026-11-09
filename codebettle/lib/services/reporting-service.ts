/**
 * Reporting service (Phase 4, §4 E: analytics and reporting).
 *
 * Pure service functions over the repositories / read queries — no
 * Next.js imports, unit-testable with the fake db. Every number comes
 * from real records; nothing is fabricated.
 *
 * Date ranges are inclusive YYYY-MM-DD strings, compared on the
 * YYYY-MM-DD date part (the domain stores dates that way, UTC).
 * - Enrolments are filtered on enrolledAt; certificates on issuedAt;
 *   reviews on createdAt.
 * - "Completed enrolments" inside a range means enrolments that were
 *   enrolled in the range and are completed (whenever they completed),
 *   so completionRate = completed / enrolled in the same cohort and
 *   can never exceed 100%.
 * - User counts and published-course counts are snapshots (all time),
 *   because they are not events that happened on a date.
 *
 * Uncapped reads: the paginated list repositories cap at 100 rows, so
 * reporting reads the full tables through getDb() in the same query
 * style the repositories use (getDb().orm.public.*), then maps rows
 * with the shared mappers. Exports therefore cover everything in
 * range, not just the first page.
 */
import { getDb } from '../db/client';
import { getAllCourses, getCourseById, getCoursesByInstructor } from '../db/courses';
import { getAllUsers, getUserById } from '../db/users';
import { listReviews } from '../db/reviews';
import { mapCertificateRow, mapEnrollmentRow } from '../db/mappers';
import type { Certificate, Course, Enrollment, Review, SafeUser } from '../db/types';
import { badRequest, notFound, type ServiceError } from './errors';

type Result<T> = T | ServiceError;

export interface DateRangeInput {
  from?: string;
  to?: string;
}

export interface DateRange {
  from?: string;
  to?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict YYYY-MM-DD check: rejects 2024-13-01 and 2024-02-30 as well as junk. */
function isValidDateString(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

/**
 * Validate an optional from/to range. Invalid dates, or from after to,
 * return a 400 service error. When omitted, the range is all time.
 */
export function parseDateRange(input: DateRangeInput): DateRange | ServiceError {
  const from = input.from === '' ? undefined : input.from;
  const to = input.to === '' ? undefined : input.to;
  if (from !== undefined && !isValidDateString(from)) {
    return badRequest('from must be a valid date in YYYY-MM-DD format');
  }
  if (to !== undefined && !isValidDateString(to)) {
    return badRequest('to must be a valid date in YYYY-MM-DD format');
  }
  if (from !== undefined && to !== undefined && from > to) {
    return badRequest('from must be on or before to');
  }
  return { from, to };
}

/** Inclusive range test on a YYYY-MM-DD date string. */
function inRange(dateStr: string, range: DateRange): boolean {
  if (!dateStr) return false;
  if (range.from !== undefined && dateStr < range.from) return false;
  if (range.to !== undefined && dateStr > range.to) return false;
  return true;
}

function completionRate(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 1000) / 10;
}

function averageRating(reviews: Review[]): number | null {
  if (reviews.length === 0) return null;
  const mean = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return Math.round(mean * 10) / 10;
}

// ---------------------------------------------------------------------------
// Data loading (uncapped, non-deleted unless stated otherwise)
// ---------------------------------------------------------------------------

interface ReportData {
  users: SafeUser[];
  courses: Course[];
  enrollments: Enrollment[];
  certificates: Certificate[];
  reviews: Review[];
  /** Ids of soft-deleted users / courses (for the integrity checks). */
  deletedUserIds: Set<string>;
  deletedCourseIds: Set<string>;
  /** All enrolment rows by id, including soft-deleted ones. */
  enrollmentById: Map<string, Enrollment>;
}

async function loadReportData(): Promise<ReportData> {
  const [users, courses, reviews, enrollmentRows, progressRows, certificateRows, userRows, courseRows] =
    await Promise.all([
      getAllUsers(),
      getAllCourses(),
      listReviews(),
      getDb().orm.public.Enrollment.all(),
      getDb().orm.public.LessonProgress.all(),
      getDb().orm.public.Certificate.all(),
      getDb().orm.public.User.all(),
      getDb().orm.public.Course.all(),
    ]);
  const enrollments = enrollmentRows
    .filter((r) => r.deletedAt === null || r.deletedAt === undefined)
    .map((r) => mapEnrollmentRow(r, progressRows));
  const enrollmentById = new Map<string, Enrollment>();
  for (const r of enrollmentRows) {
    enrollmentById.set(r.id, mapEnrollmentRow(r, progressRows));
  }
  return {
    users,
    courses,
    enrollments,
    certificates: certificateRows.map((r) => mapCertificateRow(r)),
    reviews,
    deletedUserIds: new Set(
      userRows.filter((r) => r.deletedAt !== null && r.deletedAt !== undefined).map((r) => r.id),
    ),
    deletedCourseIds: new Set(
      courseRows.filter((r) => r.deletedAt !== null && r.deletedAt !== undefined).map((r) => r.id),
    ),
    enrollmentById,
  };
}

function totalLessons(course: Course): number {
  return course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
}

// ---------------------------------------------------------------------------
// Admin overview
// ---------------------------------------------------------------------------

export interface AdminOverview {
  from?: string;
  to?: string;
  usersByRole: { student: number; instructor: number; admin: number; total: number };
  totalEnrollments: number;
  completedEnrollments: number;
  completionRate: number;
  totalRevenue: number;
  certificatesIssued: number;
  coursesPublished: number;
  totalCourses: number;
  averageRating: number | null;
  totalReviews: number;
}

export async function getAdminOverview(rangeInput: DateRangeInput): Promise<Result<AdminOverview>> {
  const range = parseDateRange(rangeInput);
  if ('error' in range) return range;
  const data = await loadReportData();
  const enrollments = data.enrollments.filter((e) => inRange(e.enrolledAt, range));
  const completed = enrollments.filter((e) => e.isCompleted);
  const certificates = data.certificates.filter((c) => inRange(c.issuedAt, range));
  const reviews = data.reviews.filter((r) => inRange(r.createdAt, range));
  const usersByRole = {
    student: data.users.filter((u) => u.role === 'student').length,
    instructor: data.users.filter((u) => u.role === 'instructor').length,
    admin: data.users.filter((u) => u.role === 'admin').length,
    total: data.users.length,
  };
  return {
    from: range.from,
    to: range.to,
    usersByRole,
    totalEnrollments: enrollments.length,
    completedEnrollments: completed.length,
    completionRate: completionRate(completed.length, enrollments.length),
    totalRevenue: enrollments.reduce((sum, e) => sum + e.amountPaid, 0),
    certificatesIssued: certificates.length,
    coursesPublished: data.courses.filter((c) => c.status === 'published').length,
    totalCourses: data.courses.length,
    averageRating: averageRating(reviews),
    totalReviews: reviews.length,
  };
}

// ---------------------------------------------------------------------------
// Per-course report
// ---------------------------------------------------------------------------

export interface CourseReport {
  course: { id: string; title: string; slug: string; category: string; level: string; status: string; price: number; instructorId: string };
  from?: string;
  to?: string;
  enrollments: number;
  completions: number;
  completionRate: number;
  revenue: number;
  averageRating: number | null;
  reviewCount: number;
  enrolledStudents: number;
}

function courseReportFor(course: Course, enrollments: Enrollment[], reviews: Review[], range: DateRange): CourseReport {
  const inRangeEnrollments = enrollments.filter((e) => inRange(e.enrolledAt, range));
  const completions = inRangeEnrollments.filter((e) => e.isCompleted);
  const inRangeReviews = reviews.filter((r) => inRange(r.createdAt, range));
  return {
    course: {
      id: course.id,
      title: course.title,
      slug: course.slug,
      category: course.category,
      level: course.level,
      status: course.status,
      price: course.price,
      instructorId: course.instructorId,
    },
    from: range.from,
    to: range.to,
    enrollments: inRangeEnrollments.length,
    completions: completions.length,
    completionRate: completionRate(completions.length, inRangeEnrollments.length),
    revenue: inRangeEnrollments.reduce((sum, e) => sum + e.amountPaid, 0),
    averageRating: averageRating(inRangeReviews),
    reviewCount: inRangeReviews.length,
    enrolledStudents: new Set(inRangeEnrollments.map((e) => e.studentId)).size,
  };
}

export async function getCourseReport(
  courseId: string,
  rangeInput: DateRangeInput,
): Promise<Result<CourseReport>> {
  const range = parseDateRange(rangeInput);
  if ('error' in range) return range;
  const course = await getCourseById(courseId);
  if (!course) return notFound('Course');
  const data = await loadReportData();
  return courseReportFor(
    course,
    data.enrollments.filter((e) => e.courseId === courseId),
    data.reviews.filter((r) => r.courseId === courseId),
    range,
  );
}

// ---------------------------------------------------------------------------
// Per-student report
// ---------------------------------------------------------------------------

export interface StudentCourseProgress {
  courseId: string;
  courseTitle: string;
  enrolledAt: string;
  isCompleted: boolean;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  amountPaid: number;
}

export interface StudentReport {
  student: { id: string; name: string; email: string; status: string; joinedAt: string };
  from?: string;
  to?: string;
  enrollments: number;
  completed: number;
  certificates: number;
  totalAmountPaid: number;
  courses: StudentCourseProgress[];
}

export async function getStudentReport(
  studentId: string,
  rangeInput: DateRangeInput,
): Promise<Result<StudentReport>> {
  const range = parseDateRange(rangeInput);
  if ('error' in range) return range;
  const student = await getUserById(studentId);
  if (!student || student.role !== 'student') return notFound('Student');
  const data = await loadReportData();
  const enrollments = data.enrollments
    .filter((e) => e.studentId === studentId)
    .filter((e) => inRange(e.enrolledAt, range));
  const courseById = new Map(data.courses.map((c) => [c.id, c]));
  const courses: StudentCourseProgress[] = enrollments.map((e) => {
    const course = courseById.get(e.courseId);
    const total = course ? totalLessons(course) : 0;
    const done = e.completedLessons.length;
    return {
      courseId: e.courseId,
      courseTitle: course ? course.title : '(deleted course)',
      enrolledAt: e.enrolledAt,
      isCompleted: e.isCompleted,
      totalLessons: total,
      completedLessons: done,
      progressPercent: total === 0 ? 0 : Math.round((done / total) * 1000) / 10,
      amountPaid: e.amountPaid,
    };
  });
  return {
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      status: student.status,
      joinedAt: student.joinedAt,
    },
    from: range.from,
    to: range.to,
    enrollments: enrollments.length,
    completed: enrollments.filter((e) => e.isCompleted).length,
    certificates: data.certificates.filter(
      (c) => c.studentId === studentId && inRange(c.issuedAt, range),
    ).length,
    totalAmountPaid: enrollments.reduce((sum, e) => sum + e.amountPaid, 0),
    courses,
  };
}

// ---------------------------------------------------------------------------
// Instructor report (ownership-scoped in the service itself)
// ---------------------------------------------------------------------------

export interface InstructorCourseBreakdown {
  courseId: string;
  courseTitle: string;
  status: string;
  enrollments: number;
  completions: number;
  completionRate: number;
  revenue: number;
  averageRating: number | null;
  reviewCount: number;
  enrolledStudents: number;
}

export interface InstructorReport {
  instructor: { id: string; name: string; email: string };
  from?: string;
  to?: string;
  totalCourses: number;
  enrollments: number;
  completions: number;
  completionRate: number;
  revenue: number;
  averageRating: number | null;
  reviewCount: number;
  enrolledStudents: number;
  courses: InstructorCourseBreakdown[];
}

export async function getInstructorReport(
  instructorId: string,
  rangeInput: DateRangeInput,
): Promise<Result<InstructorReport>> {
  const range = parseDateRange(rangeInput);
  if ('error' in range) return range;
  const instructor = await getUserById(instructorId);
  if (!instructor || instructor.role !== 'instructor') return notFound('Instructor');
  // Ownership scope: ONLY courses this instructor teaches — enforced
  // here, so no caller can widen it by passing a different id.
  const ownCourses = await getCoursesByInstructor(instructorId);
  const ownCourseIds = new Set(ownCourses.map((c) => c.id));
  const data = await loadReportData();
  const enrollments = data.enrollments.filter(
    (e) => ownCourseIds.has(e.courseId) && inRange(e.enrolledAt, range),
  );
  const reviews = data.reviews.filter(
    (r) => ownCourseIds.has(r.courseId) && inRange(r.createdAt, range),
  );
  const completions = enrollments.filter((e) => e.isCompleted);
  const courses: InstructorCourseBreakdown[] = ownCourses.map((course) => {
    const per = courseReportFor(
      course,
      data.enrollments.filter((e) => e.courseId === course.id),
      data.reviews.filter((r) => r.courseId === course.id),
      range,
    );
    return {
      courseId: per.course.id,
      courseTitle: per.course.title,
      status: per.course.status,
      enrollments: per.enrollments,
      completions: per.completions,
      completionRate: per.completionRate,
      revenue: per.revenue,
      averageRating: per.averageRating,
      reviewCount: per.reviewCount,
      enrolledStudents: per.enrolledStudents,
    };
  });
  return {
    instructor: { id: instructor.id, name: instructor.name, email: instructor.email },
    from: range.from,
    to: range.to,
    totalCourses: ownCourses.length,
    enrollments: enrollments.length,
    completions: completions.length,
    completionRate: completionRate(completions.length, enrollments.length),
    revenue: enrollments.reduce((sum, e) => sum + e.amountPaid, 0),
    averageRating: averageRating(reviews),
    reviewCount: reviews.length,
    enrolledStudents: new Set(enrollments.map((e) => e.studentId)).size,
    courses,
  };
}

// ---------------------------------------------------------------------------
// Data integrity summary (read-only diagnostics over real records)
// ---------------------------------------------------------------------------

export interface IntegrityCheck {
  key: string;
  label: string;
  count: number;
  exampleIds: string[];
}

export interface DataIntegritySummary {
  checks: IntegrityCheck[];
  totalIssues: number;
}

function toCheck(key: string, label: string, ids: string[]): IntegrityCheck {
  return { key, label, count: ids.length, exampleIds: ids.slice(0, 10) };
}

export async function getDataIntegritySummary(): Promise<DataIntegritySummary> {
  const data = await loadReportData();
  const userIds = new Set(data.users.map((u) => u.id));
  const courseIds = new Set(data.courses.map((c) => c.id));

  // (a) Non-deleted enrolments whose student or course is soft-deleted
  // (or does not exist at all).
  const orphaned = data.enrollments
    .filter(
      (e) =>
        !userIds.has(e.studentId) ||
        data.deletedUserIds.has(e.studentId) ||
        !courseIds.has(e.courseId) ||
        data.deletedCourseIds.has(e.courseId),
    )
    .map((e) => e.id);

  // (b) Enrolments with money paid but a 'free' payment status.
  const paidButFree = data.enrollments
    .filter((e) => e.amountPaid > 0 && e.paymentStatus === 'free')
    .map((e) => e.id);

  // (c) Certificates whose enrolment is missing or not completed.
  const certsForIncomplete = data.certificates
    .filter((c) => {
      const enrolment = data.enrollmentById.get(c.enrollmentId);
      return !enrolment || !enrolment.isCompleted;
    })
    .map((c) => c.id);

  // (d) Reviews for a student+course pair with no (non-deleted) enrolment.
  const enrolledPairs = new Set(data.enrollments.map((e) => `${e.studentId}:${e.courseId}`));
  const reviewsWithoutEnrollment = data.reviews
    .filter((r) => !enrolledPairs.has(`${r.studentId}:${r.courseId}`))
    .map((r) => r.id);

  const checks = [
    toCheck(
      'orphanedEnrollments',
      'Enrolments whose student or course is soft-deleted or missing',
      orphaned,
    ),
    toCheck(
      'paidButFree',
      'Enrolments with amount paid but payment status "free"',
      paidButFree,
    ),
    toCheck(
      'certificatesForIncomplete',
      'Certificates whose enrolment is not completed',
      certsForIncomplete,
    ),
    toCheck(
      'reviewsWithoutEnrollment',
      'Reviews with no matching enrolment',
      reviewsWithoutEnrollment,
    ),
  ];
  return { checks, totalIssues: checks.reduce((sum, c) => sum + c.count, 0) };
}

// ---------------------------------------------------------------------------
// Export data (uncapped — the export routes build CSV from this)
// ---------------------------------------------------------------------------

export interface ExportData {
  enrollments: Enrollment[];
  users: SafeUser[];
  courses: Course[];
}

export async function getExportData(rangeInput: DateRangeInput): Promise<Result<ExportData>> {
  const range = parseDateRange(rangeInput);
  if ('error' in range) return range;
  const data = await loadReportData();
  return {
    enrollments: data.enrollments.filter((e) => inRange(e.enrolledAt, range)),
    users: data.users,
    courses: data.courses,
  };
}
