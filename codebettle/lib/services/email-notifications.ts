/**
 * Email notification hook (Phase 4) — NOT a provider integration.
 *
 * There is no email provider configured yet (no Resend SDK installed,
 * no sending domain — see RUNBOOK §6). This module is the single place
 * the notification service asks for an email to be sent, so wiring the
 * real provider later means changing this file only.
 *
 * Behaviour today:
 * - RESEND_API_KEY absent  -> log once, return { delivered: false,
 *   reason: 'email-not-configured' }.
 * - RESEND_API_KEY present -> STILL does not send (no SDK, no domain),
 *   return { delivered: false, reason: 'email-provider-not-connected' }.
 *
 * It never throws, and a failed/unsent email never blocks the in-app
 * notification — the caller treats the result as informational.
 */

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
    // A key is set, but no Resend SDK is installed and no sending domain
    // is configured (RUNBOOK §6) — do NOT attempt a send. When the
    // provider is connected, replace this branch with the real send and
    // return { delivered: true, reason: 'sent' } on success.
    console.warn(
      '[email-notifications] RESEND_API_KEY is set but no email provider is connected yet; ' +
        `skipping email to ${input.to} for ${input.event} notification (see RUNBOOK §6).`,
    );
    return { delivered: false, reason: 'email-provider-not-connected' };
  } catch (error) {
    console.error('[email-notifications] Email hook failed:', error);
    return { delivered: false, reason: 'email-hook-error' };
  }
}
