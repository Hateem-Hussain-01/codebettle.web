/**
 * Notification service (Phase 4).
 *
 * The only place in-app notifications are created. No Next.js imports —
 * unit-testable with the fake db.
 *
 * Best-effort by design: every function catches its own failures, logs
 * them with console.error, and returns { ok: false } (or a skipped /
 * summary result) instead of throwing — a notification failure must
 * NEVER break the caller's flow (enrolment, certificate issue, ...).
 *
 * Preferences gate every send: the user's prefs are read first; when
 * inApp is off or the event toggle is off, no row is created and the
 * result is { ok: true, skipped: true, reason }. The email hook is
 * called only when prefs.email is true AND the event is allowed, and a
 * hook failure never blocks the in-app notification.
 *
 * Wiring (coordinator): the event helpers below are exported for the
 * call sites — see the hook call-site list in the Phase 4 report. This
 * file does NOT call into enrollment/application/certificate code.
 */
import { getCourseById } from '../db/courses';
import { getEnrollmentsByCourse } from '../db/enrollments';
import { createNotification } from '../db/notifications';
import { getAllUsers, getUserById, getUserNotificationPrefs } from '../db/users';
import type {
  Announcement,
  Certificate,
  Enrollment,
  InstructorApplication,
  Notification,
  NotificationEventKey,
  NotificationPrefs,
} from '../db/types';
import { deliverEmailNotification, type EmailDeliveryResult } from './email-notifications';

export interface NotifyInput {
  type: string;
  title: string;
  body: string;
  /** Prefs event key this notification belongs to. */
  event: NotificationEventKey;
}

export type NotifyResult =
  | { ok: true; notification: Notification; email?: EmailDeliveryResult }
  | { ok: true; skipped: true; reason: string; email?: EmailDeliveryResult }
  | { ok: false; reason: string };

export interface NotifySummary {
  ok: boolean;
  sent: number;
  skipped: number;
  failed: number;
}

function failure(error: unknown, context: string): { ok: false; reason: string } {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`[notification-service] ${context} failed:`, error);
  return { ok: false, reason };
}

/** Should this event reach this user at all? (inApp off or event off -> skip.) */
function eventAllowed(prefs: NotificationPrefs, event: NotificationEventKey): boolean {
  return prefs.events[event] === true;
}

/**
 * Notify one user. Reads their prefs first; skips (no row, no email)
 * when the event toggle is off, or when both in-app and email are off.
 * When inApp is off but email is on, the email hook is still attempted.
 */
export async function notifyUser(userId: string, input: NotifyInput): Promise<NotifyResult> {
  try {
    const prefs = await getUserNotificationPrefs(userId);
    if (!prefs) return { ok: false, reason: 'user-not-found' };
    if (!eventAllowed(prefs, input.event)) {
      return { ok: true, skipped: true, reason: 'event-disabled' };
    }

    let email: EmailDeliveryResult | undefined;
    if (prefs.email) {
      // Email is attempted even when inApp is off — the two channels are
      // independent. The hook itself no-ops until a provider is connected.
      const user = await getUserById(userId);
      if (user) {
        email = await deliverEmailNotification({
          to: user.email,
          subject: input.title,
          body: input.body,
          type: input.type,
          event: input.event,
        });
      }
    }

    if (!prefs.inApp) {
      return { ok: true, skipped: true, reason: 'in-app-disabled', email };
    }

    const notification = await createNotification({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
    });
    return { ok: true, notification, email };
  } catch (error) {
    return failure(error, `notifyUser(${userId}, ${input.event})`);
  }
}

/** Notify many users, skipping per-user by prefs. Never throws. */
export async function notifyUsers(userIds: string[], input: NotifyInput): Promise<NotifySummary> {
  const summary: NotifySummary = { ok: true, sent: 0, skipped: 0, failed: 0 };
  try {
    const uniqueIds = [...new Set(userIds)];
    for (const userId of uniqueIds) {
      const result = await notifyUser(userId, input);
      if (!result.ok) summary.failed += 1;
      else if ('skipped' in result && result.skipped) summary.skipped += 1;
      else summary.sent += 1;
    }
  } catch (error) {
    console.error('[notification-service] notifyUsers failed:', error);
    summary.ok = false;
  }
  return summary;
}

/** Notify every student enrolled in a course (skips per-user by prefs). */
export async function notifyEnrolledStudents(
  courseId: string,
  input: NotifyInput,
): Promise<NotifySummary> {
  try {
    const enrollments = await getEnrollmentsByCourse(courseId);
    return notifyUsers(
      enrollments.map((e) => e.studentId),
      input,
    );
  } catch (error) {
    console.error('[notification-service] notifyEnrolledStudents failed:', error);
    return { ok: false, sent: 0, skipped: 0, failed: 0 };
  }
}

/** Notify every admin user (skips per-user by prefs). */
export async function notifyAdmins(input: NotifyInput): Promise<NotifySummary> {
  try {
    const admins = (await getAllUsers()).filter((u) => u.role === 'admin');
    return notifyUsers(
      admins.map((a) => a.id),
      input,
    );
  } catch (error) {
    console.error('[notification-service] notifyAdmins failed:', error);
    return { ok: false, sent: 0, skipped: 0, failed: 0 };
  }
}

// ---------------------------------------------------------------------------
// Event helpers — one per event site. The coordinator wires each into its
// caller (see the Phase 4 report for the exact one-line call sites).
// Each builds title/body/recipients from real records and never throws.
// ---------------------------------------------------------------------------

async function courseTitle(courseId: string): Promise<string | null> {
  try {
    const course = await getCourseById(courseId);
    return course ? course.title : null;
  } catch (error) {
    console.error('[notification-service] course lookup failed:', error);
    return null;
  }
}

/** A student was enrolled in a course. Recipient: the student. */
export async function onEnrollmentCreated(enrollment: Enrollment): Promise<NotifyResult> {
  try {
    const title = await courseTitle(enrollment.courseId);
    return notifyUser(enrollment.studentId, {
      type: 'enrollment',
      event: 'enrollment',
      title: title ? `You're enrolled in ${title}` : "You're enrolled in a new course",
      body: title
        ? `Welcome to ${title}! Your enrolment is confirmed — head to your dashboard to start learning.`
        : 'Your enrolment is confirmed — head to your dashboard to start learning.',
    });
  } catch (error) {
    return failure(error, 'onEnrollmentCreated');
  }
}

/** A student completed a course. Recipient: the student. */
export async function onCourseCompleted(enrollment: Enrollment): Promise<NotifyResult> {
  try {
    const title = await courseTitle(enrollment.courseId);
    return notifyUser(enrollment.studentId, {
      type: 'completion',
      event: 'completion',
      title: title ? `Course complete: ${title}` : 'Course complete!',
      body: title
        ? `Congratulations — you've completed ${title}! Your certificate will be issued once it's reviewed.`
        : "Congratulations — you've completed a course! Your certificate will be issued once it's reviewed.",
    });
  } catch (error) {
    return failure(error, 'onCourseCompleted');
  }
}

/** A certificate was issued. Recipient: the student. Body carries the course title. */
export async function onCertificateIssued(certificate: Certificate): Promise<NotifyResult> {
  try {
    const title = await courseTitle(certificate.courseId);
    return notifyUser(certificate.studentId, {
      type: 'certificate',
      event: 'certificate',
      title: title ? `Certificate issued: ${title}` : 'Your certificate is ready!',
      body: title
        ? `Your certificate for ${title} has been issued (certificate no. ${certificate.certificateNumber}). You can download it from your certificates page.`
        : `Your certificate has been issued (certificate no. ${certificate.certificateNumber}). You can download it from your certificates page.`,
    });
  } catch (error) {
    return failure(error, 'onCertificateIssued');
  }
}

/**
 * An instructor application was reviewed. The applicant may not have a
 * user account (applications carry an email, not a userId), so the
 * recipients are the admins. Event: 'application'.
 */
export async function onApplicationReviewed(
  application: InstructorApplication,
  status: 'approved' | 'rejected',
): Promise<NotifySummary> {
  try {
    return notifyAdmins({
      type: 'application',
      event: 'application',
      title: `Instructor application ${status}: ${application.name}`,
      body:
        status === 'approved'
          ? `${application.name} (${application.email}) has been approved as an instructor.`
          : `${application.name} (${application.email}) has been rejected as an instructor.`,
    });
  } catch (error) {
    console.error('[notification-service] onApplicationReviewed failed:', error);
    return { ok: false, sent: 0, skipped: 0, failed: 0 };
  }
}

/**
 * An announcement was published. Course announcements go to the
 * enrolled students of that course; site-wide announcements go to
 * every user. Event: 'announcement'.
 */
export async function onAnnouncementPublished(announcement: Announcement): Promise<NotifySummary> {
  try {
    const input: NotifyInput = {
      type: 'announcement',
      event: 'announcement',
      title: announcement.title,
      body: announcement.content,
    };
    if (announcement.type === 'course' && announcement.courseId) {
      return notifyEnrolledStudents(announcement.courseId, input);
    }
    const users = await getAllUsers();
    return notifyUsers(
      users.map((u) => u.id),
      input,
    );
  } catch (error) {
    console.error('[notification-service] onAnnouncementPublished failed:', error);
    return { ok: false, sent: 0, skipped: 0, failed: 0 };
  }
}
