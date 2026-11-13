/**
 * System email registry — the single place that lists EVERY email the
 * app can send, what it is for, what triggers it, and who receives
 * it. Shown in the admin email-management list alongside the custom
 * builder templates.
 *
 * `active` means the email is wired in code and is sent when its
 * trigger fires. Delivery itself still needs Resend configured
 * (RESEND_API_KEY + verified codebettle.com domain) — until then every
 * email here is created/logged but not delivered, and the admin UI
 * says so. Nothing in this list is a toggle: turning a system email
 * off is a code change, not an admin setting (recipients can still
 * turn their own email notifications off in their portal prefs).
 */
export interface SystemEmailEntry {
  /** Stable key (e.g. 'verification'). */
  key: string;
  /** Display name. */
  name: string;
  /** What the email is for. */
  purpose: string;
  /** What fires it (event / user action / admin action). */
  trigger: string;
  /** Who receives it. */
  recipient: 'Student' | 'Teacher' | 'Admin' | 'New user' | 'Applicant' | 'Any user';
  /** Wired in code (sent when the trigger fires). */
  active: boolean;
  /** Where the send is triggered in code (for the admin's reference). */
  source: string;
}

export const SYSTEM_EMAILS: readonly SystemEmailEntry[] = [
  {
    key: 'verification',
    name: 'Account verification',
    purpose: 'Sent when a student creates an account — confirms their email address.',
    trigger: 'Signup (account created)',
    recipient: 'New user',
    active: true,
    source: 'requestEmailVerification (app/api/auth/route.ts)',
  },
  {
    key: 'password-reset',
    name: 'Password reset',
    purpose: 'Sent when a user asks to reset their password — carries the one-time reset link.',
    trigger: 'Password reset requested',
    recipient: 'Any user',
    active: true,
    source: 'requestPasswordReset (app/api/auth/reset/route.ts)',
  },
  {
    key: 'admin-invitation',
    name: 'Admin invitation',
    purpose: 'Sent when an admin invites a new administrator — they set their own password from the link.',
    trigger: 'Admin invites a new admin',
    recipient: 'Admin',
    active: true,
    source: 'invitation-service (sendInvitationEmail)',
  },
  {
    key: 'enrollment',
    name: 'Enrollment confirmed',
    purpose: 'Sent when a student enrols in a course — confirms the enrolment.',
    trigger: 'Enrollment created',
    recipient: 'Student',
    active: true,
    source: 'onEnrollmentCreated (notification-service)',
  },
  {
    key: 'teacher-enrollment',
    name: 'Teacher enrollment alert',
    purpose: 'Tells the instructor a new student enrolled in their course — student name only, never the fee.',
    trigger: 'Enrollment created',
    recipient: 'Teacher',
    active: true,
    source: 'onEnrollmentCreatedForInstructor (notification-service)',
  },
  {
    key: 'completion',
    name: 'Course completed',
    purpose: 'Sent when a student completes a course — congratulates them and mentions the certificate.',
    trigger: 'Course marked complete',
    recipient: 'Student',
    active: true,
    source: 'onCourseCompleted (notification-service)',
  },
  {
    key: 'certificate',
    name: 'Certificate issued',
    purpose: 'Sent when a certificate is issued — carries the certificate number and download hint.',
    trigger: 'Certificate issued',
    recipient: 'Student',
    active: true,
    source: 'onCertificateIssued (notification-service)',
  },
  {
    key: 'payment-approved',
    name: 'Payment approved',
    purpose: 'Sent when a student’s payment is verified — unlocks recordings and materials.',
    trigger: 'Payment submission approved',
    recipient: 'Student',
    active: true,
    source: 'onPaymentApproved (notification-service)',
  },
  {
    key: 'payment-rejected',
    name: 'Payment not verified',
    purpose: 'Sent when a payment submission could not be verified — the student can submit again.',
    trigger: 'Payment submission rejected',
    recipient: 'Student',
    active: true,
    source: 'onPaymentRejected (notification-service)',
  },
  {
    key: 'announcement',
    name: 'Announcement',
    purpose: 'Course or site-wide announcements, and admin broadcasts — sent to the chosen audience.',
    trigger: 'Announcement published / admin broadcast',
    recipient: 'Student',
    active: true,
    source: 'onAnnouncementPublished / sendAdminNotification',
  },
  {
    key: 'support-created',
    name: 'New support request',
    purpose: 'Tells the admins a student filed a support request.',
    trigger: 'Support request created',
    recipient: 'Admin',
    active: true,
    source: 'onSupportRequestCreated (notification-service)',
  },
  {
    key: 'support-update',
    name: 'Support request update',
    purpose: 'Sent when a support request changes status or gets an admin reply.',
    trigger: 'Support request status changed',
    recipient: 'Student',
    active: true,
    source: 'onSupportRequestStatusChanged (notification-service)',
  },
  {
    key: 'form-submission',
    name: 'New form submission',
    purpose: 'Tells the admins someone submitted a form (registration, survey, or any purpose).',
    trigger: 'Form submitted',
    recipient: 'Admin',
    active: true,
    source: 'onFormSubmissionCreated (notification-service)',
  },
  {
    key: 'application-reviewed',
    name: 'Instructor application reviewed',
    purpose: 'Tells the admins an instructor application was approved or rejected.',
    trigger: 'Instructor application reviewed',
    recipient: 'Admin',
    active: true,
    source: 'onApplicationReviewed (notification-service)',
  },
  {
    key: 'applicant-update',
    name: 'Application update',
    purpose: 'Sent to the applicant when their instructor application is reviewed, moves stage, needs more info, or they are onboarded.',
    trigger: 'Application stage / decision / onboarding',
    recipient: 'Applicant',
    active: true,
    source: 'notifyApplicant* (notification-service)',
  },
];
