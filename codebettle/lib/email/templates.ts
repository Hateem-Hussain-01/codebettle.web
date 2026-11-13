/**
 * CodeBettle email templates (auth UX upgrade + email overhaul).
 *
 * HTML emails only — never plain text alone. All templates share one
 * dark/gold layout (background #0A0A0A, card #1C1C1C, gold #F5C518,
 * matching globals.css) and a mobile-friendly single-column layout
 * (max-width 600px, fluid tables, large tap targets).
 *
 * Every template returns { subject, html, text }: the plain-text part
 * is the fallback for clients that cannot render HTML.
 *
 * Self-contained by design: emails reference NO external image URLs.
 * The header is branded text/CSS by default; see
 * EMAIL_HEADER_IMAGE_DATA_URI for the (optional) embedded header
 * image slot.
 */

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * HEADER IMAGE — embedded base64 data URI (see lib/email/assets/header-image.ts).
 *
 * The header banner Eman sent (1200x420 JPEG) is resized to 600x210
 * (email display width) at JPEG quality 80 and embedded here, so every
 * email is self-contained: no external image load, nothing to save or
 * host. To replace the header, re-encode the new image the same way
 * and update lib/email/assets/header-image.ts — every email picks it
 * up automatically.
 */
import { EMAIL_HEADER_IMAGE_DATA_URI } from './assets/header-image';

export { EMAIL_HEADER_IMAGE_DATA_URI };

/** Escape user-controlled text before it is interpolated into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutInput {
  preheader: string;
  heading: string;
  bodyHtml: string;
  /** Optional call-to-action button rendered under the body. */
  cta?: { label: string; url: string };
  /** Plain link shown under the button, for clients that strip buttons. */
  fallbackUrl?: string;
  /** Public site URL used for the footer link (defaults to production). */
  siteUrl?: string;
}

const PRODUCTION_SITE_URL = 'https://codebettle-web.vercel.app';

/**
 * Shared shell: dark background, centred gold-accented card, branded
 * header (embedded image when EMAIL_HEADER_IMAGE_DATA_URI is set,
 * otherwise the CodeBettle wordmark + tagline), footer with the site
 * link. `preheader` is the inbox preview line.
 */
export function emailLayout(input: LayoutInput): string {
  const siteUrl = input.siteUrl ?? PRODUCTION_SITE_URL;
  // Header: the embedded banner image (full card width, 600x210)
  // when set; otherwise the branded text wordmark + tagline.
  const headerRow = EMAIL_HEADER_IMAGE_DATA_URI
    ? `<tr>
          <td style="padding: 0; border-bottom: 3px solid #F5C518; font-size: 0; line-height: 0;">
            <img src="${EMAIL_HEADER_IMAGE_DATA_URI}" alt="CodeBettle — Learn. Code. Success." width="600" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0;">
          </td>
        </tr>`
    : `<tr>
          <td class="email-header" style="padding: 28px 32px 0 32px; text-align: center; border-bottom: 3px solid #F5C518;">
            <p style="margin: 0 0 4px 0; font-size: 28px; font-weight: bold; color: #F5C518; letter-spacing: 1px; line-height: 1.2;">CodeBettle</p>
            <p style="margin: 0 0 20px 0; font-size: 12px; letter-spacing: 2.5px; text-transform: uppercase; color: #9CA3AF;">Learn. Build. Ship.</p>
          </td>
        </tr>`;
  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
         <tr>
           <td align="center" style="padding: 24px 0 8px 0;">
             <a href="${input.cta.url}" style="display: inline-block; background-color: #F5C518; color: #0A0A0A; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; line-height: 1; text-decoration: none; padding: 15px 36px; border-radius: 8px;">${escapeHtml(input.cta.label)}</a>
           </td>
         </tr>
       </table>`
    : '';
  const fallback = input.fallbackUrl
    ? `<p style="margin: 16px 0 0 0; font-size: 13px; line-height: 1.6; color: #9CA3AF; word-break: break-all;">If the button does not work, copy and paste this link into your browser:<br><a href="${input.fallbackUrl}" style="color: #F5C518; text-decoration: underline;">${input.fallbackUrl}</a></p>`
    : '';
  const year = new Date().getFullYear();
  // ONE SHARED FOOTER — every email (system + custom builder
  // templates) gets this same footer through emailLayout. No template
  // defines its own footer. Branding, contact, the preferences note
  // and copyright live here and only here.
  const footer = `<tr>
          <td style="padding: 20px 32px 28px 32px; border-top: 1px solid #333333; text-align: center;">
            <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #F5C518; letter-spacing: 0.5px;">CodeBettle</p>
            <p style="margin: 0 0 8px 0; font-size: 12px; line-height: 1.6; color: #9CA3AF;">Learn. Build. Ship. — <a href="${siteUrl}" style="color: #F5C518; text-decoration: none;">codebettle.com</a></p>
            <p style="margin: 0 0 8px 0; font-size: 12px; line-height: 1.6; color: #6B7280;">You received this email because you have a CodeBettle account. These are account emails about your courses and activity — you can turn email notifications off from your portal&apos;s notification preferences. If you did not ask for this email, you can safely ignore it.</p>
            <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #4B5563;">&copy; ${year} CodeBettle. All rights reserved.</p>
          </td>
        </tr>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(input.heading)}</title>
<style>
  @media only screen and (max-width: 600px) {
    .email-card { width: 100% !important; }
    .email-body { padding: 24px 20px !important; }
    .email-header { padding: 24px 20px 0 20px !important; }
  }
</style>
</head>
<body style="margin: 0; padding: 0; background-color: #0A0A0A; font-family: Arial, Helvetica, sans-serif;">
<span style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(input.preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #0A0A0A;">
  <tr>
    <td align="center" style="padding: 32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="email-card" style="width: 600px; max-width: 600px; background-color: #1C1C1C; border-radius: 12px; overflow: hidden;">
        ${headerRow}
        <tr>
          <td class="email-body" style="padding: 32px;">
            <h1 style="margin: 0 0 16px 0; font-size: 22px; line-height: 1.3; color: #FFFFFF;">${escapeHtml(input.heading)}</h1>
            ${input.bodyHtml}
            ${cta}
            ${fallback}
          </td>
        </tr>
        ${footer}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function bodyParagraph(text: string): string {
  return `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.7; color: #E5E7EB;">${text}</p>`;
}

/** Origin (scheme + host) of a full URL, for the footer link. Falls back to production. */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return PRODUCTION_SITE_URL;
  }
}

// ---------------------------------------------------------------------------
// Signup verification email (Part 2)
// ---------------------------------------------------------------------------

export interface VerificationEmailInput {
  name: string;
  verifyUrl: string;
}

/** Sent on every student signup. Link expires after 24 hours. */
export function verificationEmail(input: VerificationEmailInput): EmailTemplate {
  const name = escapeHtml(input.name || 'there');
  const html = emailLayout({
    preheader: 'Confirm your CodeBettle email address to finish setting up your account.',
    heading: 'Verify your email',
    bodyHtml:
      bodyParagraph(`Hi ${name},`) +
      bodyParagraph(
        'Welcome to CodeBettle! Please confirm your email address to finish setting up your account. ' +
          'This link expires in 24 hours.',
      ),
    cta: { label: 'Verify your email', url: input.verifyUrl },
    fallbackUrl: input.verifyUrl,
    siteUrl: originOf(input.verifyUrl),
  });
  const text = [
    `Hi ${input.name || 'there'},`,
    '',
    'Welcome to CodeBettle! Please confirm your email address to finish setting up your account. This link expires in 24 hours.',
    '',
    `Verify your email: ${input.verifyUrl}`,
    '',
    'If you did not create a CodeBettle account, you can safely ignore this email.',
  ].join('\n');
  return { subject: 'Verify your CodeBettle email', html, text };
}

// ---------------------------------------------------------------------------
// Password-reset email (Part 1)
// ---------------------------------------------------------------------------

export interface PasswordResetEmailInput {
  name: string;
  resetUrl: string;
}

/** Reset link expires after 60 minutes (see password-reset-service). */
export function passwordResetEmail(input: PasswordResetEmailInput): EmailTemplate {
  const name = escapeHtml(input.name || 'there');
  const html = emailLayout({
    preheader: 'Reset your CodeBettle password — this link expires in 60 minutes.',
    heading: 'Reset your password',
    bodyHtml:
      bodyParagraph(`Hi ${name},`) +
      bodyParagraph(
        'We received a request to reset your CodeBettle password. Click the button below to choose a new one. ' +
          'This link expires in 60 minutes and can only be used once.',
      ) +
      bodyParagraph('If you did not request a password reset, you can safely ignore this email — your password will not change.'),
    cta: { label: 'Reset your password', url: input.resetUrl },
    fallbackUrl: input.resetUrl,
    siteUrl: originOf(input.resetUrl),
  });
  const text = [
    `Hi ${input.name || 'there'},`,
    '',
    'We received a request to reset your CodeBettle password. Use the link below to choose a new one. This link expires in 60 minutes and can only be used once.',
    '',
    `Reset your password: ${input.resetUrl}`,
    '',
    'If you did not request a password reset, you can safely ignore this email — your password will not change.',
  ].join('\n');
  return { subject: 'Reset your CodeBettle password', html, text };
}

export interface AdminInvitationEmailInput {
  name: string;
  inviteUrl: string;
  /** Whole days the link stays valid (see INVITATION_TTL_DAYS in lib/services/invitation-service.ts). */
  expiresInDays: number;
}

/**
 * Admin invitation email (Phase 2, Module 18). The invited person sets
 * their OWN password from the link — no password is ever sent in email,
 * and no admin ever chooses it for them.
 */
export function adminInvitationEmail(input: AdminInvitationEmailInput): EmailTemplate {
  const name = escapeHtml(input.name || 'there');
  const days = input.expiresInDays;
  const html = emailLayout({
    preheader: 'You have been invited to join CodeBettle as an administrator.',
    heading: 'You are invited to join CodeBettle',
    bodyHtml:
      bodyParagraph(`Hi ${name},`) +
      bodyParagraph(
        'You have been invited to join CodeBettle as an administrator. ' +
          'Click the button below to set your own password and activate your account.',
      ) +
      bodyParagraph(
        `This link expires in ${days} day${days === 1 ? '' : 's'} and can only be used once. ` +
          'Your password is yours alone — nobody at CodeBettle sets it for you.',
      ) +
      bodyParagraph('If you were not expecting this invitation, you can safely ignore this email.'),
    cta: { label: 'Set your password and join', url: input.inviteUrl },
    fallbackUrl: input.inviteUrl,
    siteUrl: originOf(input.inviteUrl),
  });
  const text = [
    `Hi ${input.name || 'there'},`,
    '',
    'You have been invited to join CodeBettle as an administrator. Use the link below to set your own password and activate your account.',
    '',
    `Join CodeBettle: ${input.inviteUrl}`,
    '',
    `This link expires in ${days} day${days === 1 ? '' : 's'} and can only be used once. Your password is yours alone — nobody at CodeBettle sets it for you.`,
    '',
    'If you were not expecting this invitation, you can safely ignore this email.',
  ].join('\n');
  return { subject: 'You are invited to join CodeBettle as an admin', html, text };
}

// ---------------------------------------------------------------------------
// Notification email (Part 1)
// ---------------------------------------------------------------------------

export interface NotificationEmailInput {
  title: string;
  body: string;
  siteUrl: string;
}

/** In-app notification mirrored by email (subject = notification title). */
export function notificationEmail(input: NotificationEmailInput): EmailTemplate {
  const html = emailLayout({
    preheader: input.title,
    heading: input.title,
    bodyHtml: bodyParagraph(escapeHtml(input.body)),
    cta: { label: 'Open CodeBettle', url: input.siteUrl },
    fallbackUrl: input.siteUrl,
    siteUrl: input.siteUrl,
  });
  const text = [`${input.title}`, '', input.body, '', `Open CodeBettle: ${input.siteUrl}`].join('\n');
  return { subject: input.title, html, text };
}
