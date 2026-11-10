/**
 * Email notification hook (Phase 4) — now wired to Resend.
 *
 * This module is the single place the notification service asks for an
 * email to be sent. Sending goes through lib/email/resend.ts, which
 * fails gracefully when RESEND_API_KEY is not set (Eman adds it in
 * Vercel and verifies the sending domain in Resend — see RUNBOOK §6).
 *
 * Behaviour:
 * - RESEND_API_KEY absent  -> log once, return { delivered: false,
 *   reason: 'email-not-configured' }.
 * - Send succeeds          -> return { delivered: true, reason: 'sent' }.
 * - Send fails              -> return { delivered: false,
 *   reason: 'email-send-failed' }.
 *
 * It never throws, and a failed/unsent email never blocks the in-app
 * notification — the caller treats the result as informational.
 */
import { sendNotificationEmail } from '../email/resend';

export interface EmailNotificationInput {
  /** Recipient address. */
  to: string;
  subject: string;
  body: string;
  /** Notification type (e.g. 'certificate', 'enrollment'). */
  type: string;
  /** Prefs event key (e.g. 'certificate'). */
  event: string;
}

export interface EmailDeliveryResult {
  delivered: boolean;
  reason: string;
}

let notConfiguredLogged = false;

export async function deliverEmailNotification(
  input: EmailNotificationInput,
): Promise<EmailDeliveryResult> {
  try {
    if (!process.env.RESEND_API_KEY) {
      if (!notConfiguredLogged) {
        notConfiguredLogged = true;
        console.warn(
          '[email-notifications] Email delivery is not configured (RESEND_API_KEY is not set); ' +
            `skipping email to ${input.to} for ${input.event} notification. ` +
            'In-app notification was still created.',
        );
      }
      return { delivered: false, reason: 'email-not-configured' };
    }
    const result = await sendNotificationEmail(input.to, input.subject, input.body);
    return result.sent
      ? { delivered: true, reason: 'sent' }
      : { delivered: false, reason: result.reason };
  } catch (error) {
    console.error('[email-notifications] Email hook failed:', error);
    return { delivered: false, reason: 'email-hook-error' };
  }
}
