/**
 * Email-template service (admin email builder).
 *
 * Admin-only: only admins create, edit, delete or test templates.
 * No Next.js imports — unit-testable with the fake db. Every mutation
 * writes an audit entry. Sending is best-effort throughout: a test
 * email that cannot be delivered (Resend not configured, send failed)
 * returns { sent: false, reason } instead of throwing, and never
 * blocks the UI.
 */
import { sendEmail } from '../email/resend';
import { emailLayout } from '../email/templates';
import { sanitizeEmailHtml } from '../sanitize';
import {
  buildPlaceholderValues,
  resolveTemplateContent,
  samplePlaceholderValues,
  type PlaceholderContext,
  type PlaceholderValues,
} from '../email/placeholders';
import {
  createEmailTemplate,
  deleteEmailTemplate,
  getEmailTemplateById,
  isEmailTemplateTableMissing,
  listEmailTemplates,
  updateEmailTemplate,
} from '../db/email-templates';
import { logAudit } from '../db/audit';
import { getAppBaseUrl } from '../email/resend';
import { badRequest, forbidden, notFound, type Actor, type ServiceError } from './errors';
import { hasAdminCapability } from '../rbac';
import type { EmailTemplate, EmailTemplateType } from '../db/types';

type Result<T> = T | ServiceError;

function requireAdmin(actor: Actor): ServiceError | null {
  return hasAdminCapability(actor) ? null : forbidden('Only admins can manage email templates');
}

export const EMAIL_TEMPLATE_TYPES: readonly EmailTemplateType[] = ['broadcast', 'system'];

function validateTemplateInput(input: {
  name?: unknown;
  subject?: unknown;
  htmlBody?: unknown;
  type?: unknown;
  isActive?: unknown;
}): ServiceError | null {
  if (typeof input.name !== 'string' || !input.name.trim()) {
    return badRequest('Template name is required');
  }
  if (input.name.trim().length > 100) return badRequest('Template name is too long (max 100 characters)');
  if (typeof input.subject !== 'string' || !input.subject.trim()) {
    return badRequest('Subject is required');
  }
  if (input.subject.trim().length > 200) return badRequest('Subject is too long (max 200 characters)');
  if (typeof input.htmlBody !== 'string' || !input.htmlBody.trim()) {
    return badRequest('Email body is required');
  }
  if (input.htmlBody.length > 100_000) return badRequest('Email body is too long (max 100,000 characters)');
  if (input.type !== undefined && !EMAIL_TEMPLATE_TYPES.includes(input.type as EmailTemplateType)) {
    return badRequest('Type must be broadcast or system');
  }
  if (input.isActive !== undefined && typeof input.isActive !== 'boolean') {
    return badRequest('isActive must be true or false');
  }
  return null;
}

export interface CreateEmailTemplateServiceInput {
  name: string;
  subject: string;
  htmlBody: string;
  type?: EmailTemplateType;
  isActive?: boolean;
}

export async function createEmailTemplateService(
  actor: Actor,
  input: CreateEmailTemplateServiceInput,
): Promise<Result<{ template: EmailTemplate }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const invalid = validateTemplateInput(input);
  if (invalid) return invalid;
  try {
    const template = await createEmailTemplate({
      name: input.name.trim(),
      subject: input.subject.trim(),
      // Sanitized on save: no scripts, no external images, no
      // javascript: links — the render pass sanitizes again.
      htmlBody: sanitizeEmailHtml(input.htmlBody),
      type: input.type ?? 'broadcast',
      isActive: input.isActive ?? true,
      createdById: actor.id,
    });
    await logAudit({
      actorId: actor.id,
      action: 'email-template.create',
      entity: 'EmailTemplate',
      entityId: template.id,
      detail: template.name,
    });
    return { template };
  } catch (error) {
    if (isEmailTemplateTableMissing(error)) {
      return badRequest('Email templates are not set up yet — run the email-template SQL migration first');
    }
    throw error;
  }
}

export interface UpdateEmailTemplateServiceInput {
  name?: string;
  subject?: string;
  htmlBody?: string;
  type?: EmailTemplateType;
  isActive?: boolean;
}

export async function updateEmailTemplateService(
  actor: Actor,
  templateId: string,
  input: UpdateEmailTemplateServiceInput,
): Promise<Result<{ template: EmailTemplate }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  // Partial update: only validate the fields actually provided.
  if (input.name !== undefined) {
    if (!input.name.trim()) return badRequest('Template name is required');
    if (input.name.trim().length > 100) return badRequest('Template name is too long (max 100 characters)');
  }
  if (input.subject !== undefined) {
    if (!input.subject.trim()) return badRequest('Subject is required');
    if (input.subject.trim().length > 200) return badRequest('Subject is too long (max 200 characters)');
  }
  if (input.htmlBody !== undefined) {
    if (!input.htmlBody.trim()) return badRequest('Email body is required');
    if (input.htmlBody.length > 100_000) return badRequest('Email body is too long (max 100,000 characters)');
  }
  if (input.type !== undefined && !EMAIL_TEMPLATE_TYPES.includes(input.type)) {
    return badRequest('Type must be broadcast or system');
  }
  if (input.isActive !== undefined && typeof input.isActive !== 'boolean') {
    return badRequest('isActive must be true or false');
  }
  try {
    const existing = await getEmailTemplateById(templateId);
    if (!existing) return notFound('Email template');
    const updated = await updateEmailTemplate(templateId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.subject !== undefined ? { subject: input.subject.trim() } : {}),
      ...(input.htmlBody !== undefined ? { htmlBody: sanitizeEmailHtml(input.htmlBody) } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    if (!updated) return notFound('Email template');
    await logAudit({
      actorId: actor.id,
      action: 'email-template.update',
      entity: 'EmailTemplate',
      entityId: updated.id,
      detail: updated.name,
    });
    return { template: updated };
  } catch (error) {
    if (isEmailTemplateTableMissing(error)) {
      return badRequest('Email templates are not set up yet — run the email-template SQL migration first');
    }
    throw error;
  }
}

export async function deleteEmailTemplateService(
  actor: Actor,
  templateId: string,
): Promise<Result<{ success: true }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  try {
    const existing = await getEmailTemplateById(templateId);
    if (!existing) return notFound('Email template');
    await deleteEmailTemplate(templateId);
    await logAudit({
      actorId: actor.id,
      action: 'email-template.delete',
      entity: 'EmailTemplate',
      entityId: templateId,
      detail: existing.name,
    });
    return { success: true };
  } catch (error) {
    if (isEmailTemplateTableMissing(error)) {
      return badRequest('Email templates are not set up yet — run the email-template SQL migration first');
    }
    throw error;
  }
}

/** List all templates (admin). Returns tableMissing when the SQL has not run. */
export async function listEmailTemplatesService(
  actor: Actor,
): Promise<Result<{ templates: EmailTemplate[]; tableMissing: boolean }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  try {
    const templates = await listEmailTemplates();
    return { templates, tableMissing: false };
  } catch (error) {
    if (isEmailTemplateTableMissing(error)) return { templates: [], tableMissing: true };
    throw error;
  }
}

/** One template by id (admin). */
export async function getEmailTemplateService(
  actor: Actor,
  templateId: string,
): Promise<Result<{ template: EmailTemplate; tableMissing: boolean }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  try {
    const template = await getEmailTemplateById(templateId);
    if (!template) return notFound('Email template');
    return { template, tableMissing: false };
  } catch (error) {
    if (isEmailTemplateTableMissing(error)) {
      return badRequest('Email templates are not set up yet — run the email-template SQL migration first');
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Rendering — a saved template resolved for one recipient.
// ---------------------------------------------------------------------------

/** Very small HTML -> plain-text conversion for the text part. */
export function templateHtmlToText(html: string): string {
  return html
    .replace(/<(br|p|div|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<\/[^>]+>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Resolve a saved template for one recipient and wrap the body in the
 * shared branded layout, so builder emails look like every other
 * CodeBettle email. Returns subject/html/text ready for sendEmail.
 * The resolved body is sanitized again here (render pass) — templates
 * stored before the sanitizer existed are covered too.
 */
export function renderEmailTemplate(
  template: Pick<EmailTemplate, 'name' | 'subject' | 'htmlBody'>,
  values: PlaceholderValues,
  siteUrl: string,
): { subject: string; html: string; text: string } {
  const resolved = resolveTemplateContent(
    { subject: template.subject, htmlBody: template.htmlBody },
    values,
  );
  const safeBody = sanitizeEmailHtml(resolved.htmlBody);
  const html = emailLayout({
    preheader: templateHtmlToText(safeBody).slice(0, 100),
    heading: resolved.subject,
    bodyHtml: safeBody,
    siteUrl,
  });
  return { subject: resolved.subject, html, text: templateHtmlToText(safeBody) };
}

/** Resolve a template for one recipient from real DB rows. */
export function renderTemplateForRecipient(
  template: Pick<EmailTemplate, 'name' | 'subject' | 'htmlBody'>,
  context: PlaceholderContext,
  siteUrl?: string,
): { subject: string; html: string; text: string } {
  const values = buildPlaceholderValues({ ...context, siteUrl: context.siteUrl ?? siteUrl ?? getAppBaseUrl() });
  return renderEmailTemplate(template, values, values.SITE_URL || getAppBaseUrl());
}

// ---------------------------------------------------------------------------
// Test email — send the template to the admin's own inbox.
// ---------------------------------------------------------------------------

export interface SendTestEmailResult {
  sent: boolean;
  reason: string;
}

/**
 * Send a test email of the template to the admin's own email address,
 * resolved with sample data. Best-effort: when Resend is not
 * configured the send is skipped and { sent: false,
 * reason: 'email-not-configured' } is returned — never throws, never
 * blocks the UI.
 */
export async function sendTestEmailService(
  actor: Actor,
  templateId: string,
  toEmail: string,
): Promise<Result<SendTestEmailResult>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  try {
    const template = await getEmailTemplateById(templateId);
    if (!template) return notFound('Email template');
    const siteUrl = getAppBaseUrl();
    const rendered = renderEmailTemplate(
      template,
      samplePlaceholderValues(siteUrl),
      siteUrl,
    );
    const result = await sendEmail({
      to: toEmail,
      subject: `[Test] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
    });
    return { sent: result.sent, reason: result.reason };
  } catch (error) {
    if (isEmailTemplateTableMissing(error)) {
      return badRequest('Email templates are not set up yet — run the email-template SQL migration first');
    }
    throw error;
  }
}
