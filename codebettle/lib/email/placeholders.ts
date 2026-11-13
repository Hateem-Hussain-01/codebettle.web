/**
 * Placeholder engine for admin email templates (email builder).
 *
 * Placeholders look like {{STUDENT_NAME}} and are resolved per
 * recipient at send time from real DB data (the student portal /
 * enrolment / course rows) — never from client input. User-supplied
 * values are HTML-escaped before substitution, so a student name
 * can never break the email HTML. Unknown placeholders are left
 * untouched (never a crash), and a known placeholder with no value
 * resolves to an empty string.
 */
import { escapeHtml } from './templates';

/** One placeholder the builder offers. `key` is the {{KEY}} token. */
export interface EmailPlaceholder {
  key: string;
  label: string;
  description: string;
}

export const EMAIL_PLACEHOLDERS: readonly EmailPlaceholder[] = [
  { key: 'STUDENT_NAME', label: 'Student name', description: 'The recipient student’s full name.' },
  { key: 'STUDENT_EMAIL', label: 'Student email', description: 'The recipient student’s email address.' },
  { key: 'COURSE_NAME', label: 'Course name', description: 'The course the email is about.' },
  { key: 'TEACHER_NAME', label: 'Teacher name', description: 'The course instructor’s name.' },
  { key: 'ADMIN_NAME', label: 'Admin name', description: 'The admin who sent the email.' },
  { key: 'VERIFY_URL', label: 'Verify email link', description: 'The account-verification link (verification emails).' },
  { key: 'RESET_URL', label: 'Password reset link', description: 'The password-reset link (reset emails).' },
  { key: 'SITE_URL', label: 'Site URL', description: 'The public CodeBettle site URL.' },
  { key: 'ENROLLMENT_DATE', label: 'Enrollment date', description: 'When the student enrolled (YYYY-MM-DD).' },
  { key: 'CERTIFICATE_NUMBER', label: 'Certificate number', description: 'The student’s certificate number, when one exists.' },
  { key: 'BATCH', label: 'Batch', description: 'The certificate batch (e.g. BATCH-8), when one exists.' },
];

export const EMAIL_PLACEHOLDER_KEYS: readonly string[] = EMAIL_PLACEHOLDERS.map((p) => p.key);

/** Values for one recipient. Missing keys resolve to an empty string. */
export type PlaceholderValues = Partial<Record<string, string>>;

const PLACEHOLDER_PATTERN = /\{\{([A-Z0-9_]+)\}\}/g;

/**
 * Substitute {{KEY}} tokens in `text` with the matching values.
 * Values are HTML-escaped (they may be user-supplied names); unknown
 * tokens are left exactly as written. `escape` can be turned off for
 * plain-text bodies (no HTML to break).
 */
export function resolvePlaceholders(
  text: string,
  values: PlaceholderValues,
  opts: { escape?: boolean } = {},
): string {
  const escape = opts.escape ?? true;
  return text.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    if (!(key in values)) return match;
    const value = values[key] ?? '';
    return escape ? escapeHtml(value) : value;
  });
}

/** Resolve both the subject and the HTML body of a template. */
export function resolveTemplateContent(
  input: { subject: string; htmlBody: string },
  values: PlaceholderValues,
): { subject: string; htmlBody: string } {
  return {
    // Subjects are plain text — no HTML escaping needed there.
    subject: resolvePlaceholders(input.subject, values, { escape: false }),
    htmlBody: resolvePlaceholders(input.htmlBody, values, { escape: true }),
  };
}

/**
 * Build the placeholder values for one recipient from real records.
 * Everything here comes from the DB (user / course / enrolment /
 * certificate rows) — callers pass the rows they already have, so no
 * extra queries happen inside the engine.
 */
export interface PlaceholderContext {
  student?: { name?: string | null; email?: string | null };
  teacher?: { name?: string | null };
  admin?: { name?: string | null };
  course?: { title?: string | null };
  enrollment?: { enrolledAt?: string | Date | null };
  certificate?: { certificateNumber?: string | null; batch?: string | null };
  verifyUrl?: string;
  resetUrl?: string;
  siteUrl?: string;
}

export function buildPlaceholderValues(context: PlaceholderContext): PlaceholderValues {
  const enrolledAt = context.enrollment?.enrolledAt;
  const enrollmentDate =
    enrolledAt instanceof Date
      ? enrolledAt.toISOString().slice(0, 10)
      : typeof enrolledAt === 'string'
        ? enrolledAt.slice(0, 10)
        : '';
  return {
    STUDENT_NAME: context.student?.name ?? '',
    STUDENT_EMAIL: context.student?.email ?? '',
    COURSE_NAME: context.course?.title ?? '',
    TEACHER_NAME: context.teacher?.name ?? '',
    ADMIN_NAME: context.admin?.name ?? '',
    VERIFY_URL: context.verifyUrl ?? '',
    RESET_URL: context.resetUrl ?? '',
    SITE_URL: context.siteUrl ?? '',
    ENROLLMENT_DATE: enrollmentDate,
    CERTIFICATE_NUMBER: context.certificate?.certificateNumber ?? '',
    BATCH: context.certificate?.batch ?? '',
  };
}

/** Sample values for the builder preview (no real student data). */
export function samplePlaceholderValues(siteUrl: string): PlaceholderValues {
  return {
    STUDENT_NAME: 'Ali Raza',
    STUDENT_EMAIL: 'ali@example.com',
    COURSE_NAME: 'Python Crash Course Batch 09',
    TEACHER_NAME: 'Usman Tariq',
    ADMIN_NAME: 'Hateem Hussain',
    VERIFY_URL: `${siteUrl}/auth/verify-email?token=sample`,
    RESET_URL: `${siteUrl}/auth/reset?token=sample`,
    SITE_URL: siteUrl,
    ENROLLMENT_DATE: '2026-11-13',
    CERTIFICATE_NUMBER: 'CB-2026-008',
    BATCH: 'BATCH-8',
  };
}
