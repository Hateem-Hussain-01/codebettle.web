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
 * Phase 3 exception (judgment call, see the Phase 3 report):
 * important / special_notice notifications BYPASS the per-event toggle
 * — they must reach everyone, otherwise the acknowledge gate is
 * meaningless. The bypass skips ONLY the event-toggle check: inApp off
 * still means no in-app row, and email still follows prefs.email.
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
  FormDefinition,
  FormSubmission,
  InstructorApplication,
  Notification,
  NotificationCategory,
  NotificationEventKey,
  NotificationPrefs,
  PaymentSubmission,
  SupportRequest,
} from '../db/types';
import {
  PREFS_BYPASS_CATEGORIES,
  SUPPORT_REQUEST_CATEGORY_LABELS,
} from '../db/types';
import { deliverEmailNotification, type EmailDeliveryResult } from './email-notifications';
import { hasAdminCapability, hasTeacherCapability } from '../rbac';

export interface NotifyInput {
  type: string;
  title: string;
  body: string;
  /** Prefs event key this notification belongs to. */
  event: NotificationEventKey;
  /** Phase 3: general | important | warning | special_notice (default general). */
  category?: NotificationCategory;
  /** Phase 3: the Announcement this row was fanned out from. */
  announcementId?: string;
  /** Phase 3: optional deep link. */
  linkUrl?: string;
  /** Phase 3: true when the user must acknowledge this notification. */
  requiresAcknowledge?: boolean;
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
 *
 * Phase 3: an important / special_notice category BYPASSES the
 * per-event toggle check (see the file header) — the toggle is the
 * only thing skipped; inApp off still means no row is created.
 */
export async function notifyUser(userId: string, input: NotifyInput): Promise<NotifyResult> {
  try {
    const prefs = await getUserNotificationPrefs(userId);
    if (!prefs) return { ok: false, reason: 'user-not-found' };
    const category = input.category ?? 'general';
    const bypassesPrefs = (PREFS_BYPASS_CATEGORIES as readonly string[]).includes(category);
    if (!bypassesPrefs && !eventAllowed(prefs, input.event)) {
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
      category,
      announcementId: input.announcementId,
      linkUrl: input.linkUrl,
      requiresAcknowledge: input.requiresAcknowledge ?? false,
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
    // Phase 2: anyone with the admin capability (flag or legacy role).
    const admins = (await getAllUsers()).filter((u) => hasAdminCapability(u));
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

// ---------------------------------------------------------------------------
// Applicant-facing recruitment notifications (Phase 2, Modules 19/20/21).
//
// Unlike onApplicationReviewed above (admins only), these notify the
// APPLICANT — but only when the application is linked to an account
// (userId). An applicant who filed before creating an account has no
// userId, so there is nobody to notify in-app; the function returns
// { ok: false, reason: 'no-account' } instead of throwing, and the
// caller carries on (the stage change itself is never blocked by a
// missing notification). Best-effort, like every other hook here.
// ---------------------------------------------------------------------------

/** Notify the applicant of a review decision (approved / rejected). */
export async function notifyApplicantReviewed(
  application: InstructorApplication,
  status: 'approved' | 'rejected',
): Promise<NotifyResult> {
  if (!application.userId) return { ok: false, reason: 'no-account' };
  return notifyUser(application.userId, {
    type: 'application',
    event: 'application',
    title:
      status === 'approved'
        ? 'Your instructor application was approved'
        : 'Your instructor application was not approved',
    body:
      status === 'approved'
        ? 'Good news — your application to teach at CodeBettle was approved. Our team will contact you about the next onboarding step.'
        : 'Thank you for applying to teach at CodeBettle. Unfortunately your application was not approved this time — you are welcome to apply again in the future.',
  });
}

/** Notify the applicant that their application moved to a new stage. */
export async function notifyApplicantStageChanged(
  application: InstructorApplication,
  stageName: string,
  instructions?: string,
): Promise<NotifyResult> {
  if (!application.userId) return { ok: false, reason: 'no-account' };
  return notifyUser(application.userId, {
    type: 'application',
    event: 'application',
    title: `Application update: ${stageName}`,
    body: instructions?.trim()
      ? `Your instructor application moved to “${stageName}”. ${instructions.trim()}`
      : `Your instructor application moved to “${stageName}”. You can track your progress in the applicant portal.`,
  });
}

/** Notify the applicant that the admin asked for more information. */
export async function notifyApplicantInfoRequested(
  application: InstructorApplication,
  note?: string,
): Promise<NotifyResult> {
  if (!application.userId) return { ok: false, reason: 'no-account' };
  return notifyUser(application.userId, {
    type: 'application',
    event: 'application',
    title: 'More information needed for your application',
    body: note?.trim()
      ? `Our team needs a little more from you for your instructor application: ${note.trim()}`
      : 'Our team needs a little more from you for your instructor application. Please check your email or the applicant portal.',
  });
}

/** Notify the applicant that they are now onboarded as a teacher. */
export async function notifyApplicantOnboarded(
  application: InstructorApplication,
): Promise<NotifyResult> {
  if (!application.userId) return { ok: false, reason: 'no-account' };
  return notifyUser(application.userId, {
    type: 'application',
    event: 'application',
    title: 'Welcome to CodeBettle — you are now a teacher!',
    body: 'Your onboarding is complete. Sign in with your existing account to open the Teacher Portal and start setting up your courses.',
  });
}

/**
 * A payment submission was approved. Recipient: the student.
 * Event: 'enrollment' (reused — there is no separate `payment`
 * notification event key; payment verification is part of the
 * enrolment lifecycle, so it shares the enrolment toggle).
 */
export async function onPaymentApproved(
  enrollment: Enrollment,
  submission: PaymentSubmission,
  courseTitleText: string,
): Promise<NotifyResult> {
  try {
    return notifyUser(enrollment.studentId, {
      type: 'payment',
      event: 'enrollment',
      title: `Payment confirmed: ${courseTitleText}`,
      body: `Your payment of PKR ${submission.amountPkr} (ref ${submission.transactionRef}) for ${courseTitleText} has been verified. Your recordings and class materials are now unlocked.`,
    });
  } catch (error) {
    return failure(error, 'onPaymentApproved');
  }
}

/**
 * A payment submission was rejected. Recipient: the student, with the
 * admin's reason when one was given — and the pending block lifts, so
 * they can submit again. Event: 'enrollment' (reused, see above).
 */
export async function onPaymentRejected(
  enrollment: Enrollment,
  submission: PaymentSubmission,
  courseTitleText: string,
  reason?: string,
): Promise<NotifyResult> {
  try {
    const reasonText = reason?.trim()
      ? ` Reason: ${reason.trim()}`
      : '';
    return notifyUser(enrollment.studentId, {
      type: 'payment',
      event: 'enrollment',
      title: `Payment not verified: ${courseTitleText}`,
      body: `Your payment submission (ref ${submission.transactionRef}) for ${courseTitleText} could not be verified.${reasonText} You can submit your payment again from the course page.`,
    });
  } catch (error) {
    return failure(error, 'onPaymentRejected');
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

// ---------------------------------------------------------------------------
// Admin broadcast sends (Phase 3, Module 7).
//
// POST /api/admin/notifications calls sendAdminNotification. One
// Notification row is created per recipient (the same one-row-per-
// recipient shape as every other notification); the fan-out is N
// sequential notifyUser calls via notifyUsers — acceptable at this
// scale, and each recipient's prefs are still honoured, except that
// important / special_notice categories bypass the per-event toggle
// (see notifyUser). A broadcast failure never throws: the summary
// counts sent / skipped / failed instead.
// ---------------------------------------------------------------------------

export type AdminSendTarget =
  | { type: 'all' }
  | { type: 'role'; role: 'student' | 'instructor' | 'admin' }
  | { type: 'user'; userId: string }
  | { type: 'course'; courseId: string };

export interface SendAdminNotificationInput {
  title: string;
  body: string;
  category: NotificationCategory;
  target: AdminSendTarget;
  requiresAcknowledge?: boolean;
  linkUrl?: string;
}

export async function sendAdminNotification(
  input: SendAdminNotificationInput,
): Promise<NotifySummary> {
  try {
    const notifyInput: NotifyInput = {
      type: 'announcement',
      event: 'announcement',
      title: input.title,
      body: input.body,
      category: input.category,
      linkUrl: input.linkUrl,
      requiresAcknowledge: input.requiresAcknowledge ?? false,
    };
    if (input.target.type === 'course') {
      return notifyEnrolledStudents(input.target.courseId, notifyInput);
    }
    if (input.target.type === 'user') {
      const user = await getUserById(input.target.userId);
      if (!user) return { ok: false, sent: 0, skipped: 0, failed: 1 };
      const result = await notifyUser(input.target.userId, notifyInput);
      if (!result.ok) return { ok: false, sent: 0, skipped: 0, failed: 1 };
      if ('skipped' in result && result.skipped) return { ok: true, sent: 0, skipped: 1, failed: 0 };
      return { ok: true, sent: 1, skipped: 0, failed: 0 };
    }
    const users = await getAllUsers();
    const ids =
      input.target.type === 'all'
        ? users.map((u) => u.id)
        : input.target.role === 'student'
          ? users.filter((u) => u.role === 'student').map((u) => u.id)
          : input.target.role === 'instructor'
            ? users.filter((u) => hasTeacherCapability(u)).map((u) => u.id)
            : users.filter((u) => hasAdminCapability(u)).map((u) => u.id);
    return notifyUsers(ids, notifyInput);
  } catch (error) {
    console.error('[notification-service] sendAdminNotification failed:', error);
    return { ok: false, sent: 0, skipped: 0, failed: 0 };
  }
}

// ---------------------------------------------------------------------------
// Support-request hooks (Phase 3, Module 7). Best-effort, like every
// other hook here: a notification failure never blocks the request
// itself. The email hook stays inert until Resend is configured.
// ---------------------------------------------------------------------------

/** A student filed a support request. Recipients: every admin. */
export async function onSupportRequestCreated(
  request: SupportRequest,
  studentName?: string,
): Promise<NotifySummary> {
  try {
    const who = studentName?.trim() ? ` from ${studentName.trim()}` : '';
    const label = SUPPORT_REQUEST_CATEGORY_LABELS[request.category] ?? request.category;
    return notifyAdmins({
      type: 'support_request',
      event: 'support_request',
      title: `New support request: ${request.subject}`,
      body: `${label}${who}: ${request.subject}`,
    });
  } catch (error) {
    console.error('[notification-service] onSupportRequestCreated failed:', error);
    return { ok: false, sent: 0, skipped: 0, failed: 0 };
  }
}

/**
 * A support request changed status (or got an admin reply).
 * Recipient: the student who filed it.
 */
export async function onSupportRequestStatusChanged(
  request: SupportRequest,
): Promise<NotifyResult> {
  try {
    const statusText =
      request.status === 'resolved'
        ? 'resolved'
        : request.status === 'rejected'
          ? 'closed without action'
          : request.status === 'in_progress'
            ? 'being worked on'
            : 'under review';
    const reply = request.adminReply?.trim()
      ? ` Our reply: ${request.adminReply.trim()}`
      : '';
    return notifyUser(request.studentId, {
      type: 'request_update',
      event: 'request_update',
      title: `Update on your request: ${request.subject}`,
      body: `Your support request “${request.subject}” is now ${statusText}.${reply}`,
    });
  } catch (error) {
    return failure(error, 'onSupportRequestStatusChanged');
  }
}

// ---------------------------------------------------------------------------
// Form-submission hook (Phase 6, Module — Forms Builder). Best-effort,
// like every other hook here: a notification failure never blocks the
// submission itself (the caller in lib/services/form-service.ts also
// catches). The submitter is NOT notified — only the admins are, so
// they can review the submission. Event: 'form_submission'.
// ---------------------------------------------------------------------------

/** A form was submitted (signed-in or anonymous). Recipients: every admin. */
export async function onFormSubmissionCreated(
  form: FormDefinition,
  submission: FormSubmission,
  submitterId?: string,
): Promise<NotifySummary> {
  try {
    const who = submitterId ? ' A signed-in user submitted it.' : ' Submitted anonymously.';
    return notifyAdmins({
      type: 'form_submission',
      event: 'form_submission',
      title: `New submission: ${form.name}`,
      body: `A new response was submitted to the “${form.name}” form.${who}`,
      linkUrl: '/admin/forms',
    });
  } catch (error) {
    console.error('[notification-service] onFormSubmissionCreated failed:', error);
    return { ok: false, sent: 0, skipped: 0, failed: 0 };
  }
}
