/**
 * CSV export builder (Phase 4 reporting).
 *
 * Pure functions — no database access. Callers fetch the data first
 * (see getExportData in lib/services/reporting-service.ts) and pass
 * the already-fetched rows in.
 *
 * RFC 4180: a field containing a comma, a double quote, or a newline
 * is wrapped in double quotes, and internal double quotes are doubled.
 * Output is UTF-8 text with a header row.
 */
import type { Course, Enrollment, SafeUser } from '../db/types';

type Cell = string | number | null | undefined;

/** Escape one CSV field per RFC 4180. */
export function escapeCsvCell(value: Cell): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Build a CSV document (header row + one row per record). */
export function toCsv(rows: Cell[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

function userName(users: SafeUser[], id: string): string {
  return users.find((u) => u.id === id)?.name ?? '';
}

function userEmail(users: SafeUser[], id: string): string {
  return users.find((u) => u.id === id)?.email ?? '';
}

function courseTitle(courses: Course[], id: string): string {
  return courses.find((c) => c.id === id)?.title ?? '';
}

/** All enrolments with student, course, date, completion and payment info. */
export function enrollmentsCsv(
  enrollments: Enrollment[],
  users: SafeUser[],
  courses: Course[],
): string {
  const header = [
    'Student',
    'Email',
    'Course',
    'Enrolled Date',
    'Completed',
    'Completed Date',
    'Payment Status',
    'Amount Paid (PKR)',
    'Coupon',
  ];
  const rows = enrollments.map((e) => [
    userName(users, e.studentId),
    userEmail(users, e.studentId),
    courseTitle(courses, e.courseId),
    e.enrolledAt,
    e.isCompleted ? 'Yes' : 'No',
    e.completedAt ?? '',
    e.paymentStatus,
    e.amountPaid,
    e.couponUsed ?? '',
  ]);
  return toCsv([header, ...rows]);
}

/** All users with role, status, join date and enrolment count. */
export function studentsCsv(users: SafeUser[]): string {
  const header = ['Name', 'Email', 'Role', 'Status', 'Joined', 'Enrolled Courses'];
  const rows = users.map((u) => [
    u.name,
    u.email,
    u.role,
    u.status,
    u.joinedAt,
    u.enrolledCourses?.length ?? 0,
  ]);
  return toCsv([header, ...rows]);
}

/** One row per course with enrolments, completions and revenue. */
export function coursesCsv(courses: Course[], enrollments: Enrollment[]): string {
  const header = [
    'Course',
    'Slug',
    'Category',
    'Level',
    'Status',
    'Price (PKR)',
    'Enrollments',
    'Completions',
    'Revenue (PKR)',
  ];
  const rows = courses.map((c) => {
    const courseEnrollments = enrollments.filter((e) => e.courseId === c.id);
    return [
      c.title,
      c.slug,
      c.category,
      c.level,
      c.status,
      c.price,
      courseEnrollments.length,
      courseEnrollments.filter((e) => e.isCompleted).length,
      courseEnrollments.reduce((sum, e) => sum + e.amountPaid, 0),
    ];
  });
  return toCsv([header, ...rows]);
}

/** Revenue breakdown per course. */
export function revenueCsv(courses: Course[], enrollments: Enrollment[]): string {
  const header = ['Course', 'Category', 'Enrollments', 'Completions', 'Revenue (PKR)'];
  const rows = courses.map((c) => {
    const courseEnrollments = enrollments.filter((e) => e.courseId === c.id);
    return [
      c.title,
      c.category,
      courseEnrollments.length,
      courseEnrollments.filter((e) => e.isCompleted).length,
      courseEnrollments.reduce((sum, e) => sum + e.amountPaid, 0),
    ];
  });
  return toCsv([header, ...rows]);
}
