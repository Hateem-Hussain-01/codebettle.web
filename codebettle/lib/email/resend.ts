/**
 * Email delivery via Resend (auth UX upgrade, Part 1).
 *
 * Single sending seam for the whole app: password-reset emails,
 * notification emails and signup verification emails all go through
 * `sendEmail` here. The `resend` package is installed; the key and the
 * sender address come from env only — never from code.
 *
 * Graceful degradation by design: when RESEND_API_KEY is not set, or a
 * send fails, the function logs a warning and returns
 * { sent: false, reason } instead of throwing, so signup, password
 * reset and notifications keep working without email. Callers must
 * treat the result as informational.
 *
 * Env:
 * - RESEND_API_KEY — Resend API key (Eman adds it in Vercel; never commit it).
 * - EMAIL_FROM — sender address on the verified domain, e.g.
 *   "CodeBettle <noreply@codebettle.com>". Falls back to the
 *   noreply@codebettle.com address; that only delivers once Eman has
 *   verified the codebettle.com domain in Resend.
 * - NEXT_PUBLIC_APP_URL — public site URL used for links in emails
 *   (defaults to the production site).
 */
import { Resend } from 'resend';
import {
  adminInvitationEmail,
  bookACallEmail,
  notificationEmail,
  passwordResetEmail,
  verificationEmail,
  type EmailTemplate,
} from './templates';
import { adminUrl } from '../admin-url';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  sent: boolean;
  reason: string;
  /** Resend message id, when the send succeeded. */
  id?: string;
}

/**
 * Transport seam: the function that actually hands a message to Resend.
 * Tests pass a fake; production uses the default Resend transport.
 * A transport resolves with the message id, or throws / returns an
 * error string on failure.
 */
export type EmailTransport = (
  input: Required<Pick<SendEmailInput, 'to' | 'subject' | 'html' | 'text'>> & { from: string },
) => Promise<{ id?: string; error?: string }>;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Sender address: EMAIL_FROM, or the CodeBettle noreply address. */
export function getEmailFrom(): string {
  return process.env.EMAIL_FROM ?? 'CodeBettle <noreply@codebettle.com>';
}

/**
 * Public site URL for links inside emails. An explicit origin (e.g. the
 * request origin in a route handler) wins; otherwise NEXT_PUBLIC_APP_URL;
 * otherwise the production site.
 */
export function getAppBaseUrl(origin?: string): string {
  if (origin) return origin.replace(/\/$/, '');
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (envUrl) return envUrl;
  return 'https://codebettle-web.vercel.app';
}

let notConfiguredLogged = false;

/** Default transport: one Resend client per send, from the env key. */
async function resendTransport(
  input: Required<Pick<SendEmailInput, 'to' | 'subject' | 'html' | 'text'>> & { from: string },
): Promise<{ id?: string; error?: string }> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: input.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  if (error) return { error: error.message ?? String(error) };
  return { id: data?.id };
}

export async function sendEmail(
  input: SendEmailInput,
  opts: { transport?: EmailTransport } = {},
): Promise<SendEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    if (!notConfiguredLogged) {
      notConfiguredLogged = true;
      console.warn(
        '[email] RESEND_API_KEY is not set — skipping email to ' +
          `${input.to} (subject: "${input.subject}"). ` +
          'Add the key to Vercel env vars to enable email delivery.',
      );
    }
    return { sent: false, reason: 'email-not-configured' };
  }
  try {
    const transport = opts.transport ?? resendTransport;
    const result = await transport({
      from: getEmailFrom(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? '',
    });
    if (result.error) {
      console.error(`[email] Resend failed to send to ${input.to}:`, result.error);
      return { sent: false, reason: 'email-send-failed' };
    }
    return { sent: true, reason: 'sent', id: result.id };
  } catch (error) {
    console.error(`[email] Email send to ${input.to} threw:`, error);
    return { sent: false, reason: 'email-send-failed' };
  }
}

/** Send a templated email (subject/html/text from a template builder). */
async function sendTemplatedEmail(
  to: string,
  template: EmailTemplate,
  opts: { transport?: EmailTransport } = {},
): Promise<SendEmailResult> {
  return sendEmail(
    { to, subject: template.subject, html: template.html, text: template.text },
    opts,
  );
}

// ---------------------------------------------------------------------------
// Per-purpose senders (used by the password-reset, notification and
// verification services/routes). Each returns the SendEmailResult so the
// caller can record whether the email actually went out.
// ---------------------------------------------------------------------------

/** Password-reset link email. `baseUrl` is the request origin. */
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
  baseUrl: string,
  opts: { transport?: EmailTransport } = {},
): Promise<SendEmailResult> {
  const resetUrl = `${getAppBaseUrl(baseUrl)}/auth/reset?token=${encodeURIComponent(token)}`;
  return sendTemplatedEmail(to, passwordResetEmail({ name, resetUrl }), opts);
}

/** Signup verification email. `baseUrl` is the request origin. */
export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
  baseUrl: string,
  opts: { transport?: EmailTransport } = {},
): Promise<SendEmailResult> {
  const verifyUrl = `${getAppBaseUrl(baseUrl)}/auth/verify-email?token=${encodeURIComponent(token)}`;
  return sendTemplatedEmail(to, verificationEmail({ name, verifyUrl }), opts);
}

/** Notification email (subject/body mirror the in-app notification). */
export async function sendNotificationEmail(
  to: string,
  title: string,
  body: string,
  opts: { transport?: EmailTransport } = {},
): Promise<SendEmailResult> {
  return sendTemplatedEmail(
    to,
    notificationEmail({ title, body, siteUrl: getAppBaseUrl() }),
    opts,
  );
}

/** Public accept-invitation link for a raw token. The token itself is never stored. */
export function buildInvitationUrl(baseUrl: string, token: string): string {
  return `${getAppBaseUrl(baseUrl)}/auth/accept-invitation?token=${encodeURIComponent(token)}`;
}

/**
 * Secret admin sign-in page URL (PR #33). Built from the
 * ADMIN_BASE_PATH env var (via adminUrl) — the admin area is not
 * linked anywhere public, so this is the link a new admin must save.
 * Sent only to invited admins (in the invitation email) and shown
 * only inside the admin area; never in a public page or email.
 */
export function buildAdminPortalUrl(baseUrl: string): string {
  return `${getAppBaseUrl(baseUrl)}${adminUrl('/signin')}`;
}

/**
 * Book-a-call recipients (PR #33), confirmed by Eman 13 Nov 2026
 * ~22:01 PKT. Ahmad Hassan's address came from memory
 * (ahmad.hassan.hnd@gmail.com) — flag for confirmation before relying
 * on it. The booking is saved first and the email is best-effort
 * (Resend may not be configured); a failed send never blocks the save.
 */
export const BOOK_A_CALL_RECIPIENTS: readonly string[] = [
  'ahmad.hassan.hnd@gmail.com',
  'zohadijaz786@gmail.com',
  'mhateemjutt1412@gmail.com',
];

/**
 * Book-a-call notification (PR #33). Sends the booking to the 3
 * confirmed recipients, one email each, and returns per-recipient
 * results. Best-effort: when Resend is not configured every send is
 * skipped ({ sent: false, reason: 'email-not-configured' }) and the
 * caller still keeps the saved booking. Never throws.
 */
export async function sendBookACallEmail(
  booking: {
    fullName: string;
    email: string;
    phone?: string;
    currentStatus: string;
    courseInterest?: string;
    guidanceNeeded: string;
    preferredContact?: string;
  },
  opts: { transport?: EmailTransport; baseUrl?: string } = {},
): Promise<SendEmailResult[]> {
  const baseUrl = getAppBaseUrl(opts.baseUrl);
  const template = bookACallEmail({
    ...booking,
    adminUrl: `${baseUrl}${adminUrl('/book-a-call')}`,
    siteUrl: baseUrl,
  });
  const results: SendEmailResult[] = [];
  for (const to of BOOK_A_CALL_RECIPIENTS) {
    results.push(await sendTemplatedEmail(to, template, opts));
  }
  return results;
}

/**
 * Admin invitation email (Phase 2, Module 18). Best-effort like the
 * other senders: when Resend is not configured the send is skipped and
 * the caller gets { sent: false, reason: 'email-not-configured' } — the
 * invitation itself is still created and the admin copies the link
 * from the create response instead. Never throws.
 */
export async function sendInvitationEmail(
  to: string,
  name: string,
  token: string,
  baseUrl: string,
  expiresInDays: number,
  opts: { transport?: EmailTransport } = {},
): Promise<SendEmailResult> {
  const inviteUrl = buildInvitationUrl(baseUrl, token);
  return sendTemplatedEmail(
    to,
    adminInvitationEmail({ name, inviteUrl, expiresInDays, portalUrl: buildAdminPortalUrl(baseUrl) }),
    opts,
  );
}
