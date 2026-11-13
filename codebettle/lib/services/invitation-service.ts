/**
 * Admin invitation service (Phase 2, Module 18 — independent admin
 * access assignment + invitations).
 *
 * The missing half of /admin/access: a person with NO account yet cannot
 * be picked in the user picker, so a full admin invites them instead.
 * The invitation carries the grants (admin flag, optional teacher flag,
 * per-area permissions) and the invitee sets their OWN password on
 * accept — mirroring the first-run setup pattern (lib/services/first-run.ts):
 * passwords are chosen by the person, bcrypt-hashed, never invented by
 * an admin and never sent by email.
 *
 * Token pattern (same as PasswordReset / EmailVerification): a random
 * 256-bit token is generated, ONLY its SHA-256 hash is stored, and the
 * raw token is returned to the caller exactly once, inside the invite
 * URL. Invitations are single-use (usedAt, enforced by
 * markInvitationUsed matching only usedAt IS NULL) and expire after
 * INVITATION_TTL_DAYS days.
 *
 * Email is best-effort: when Resend is not configured (or the send
 * fails), the invitation is STILL created and the create/resend result
 * carries the copyable inviteUrl + emailSent: false, so the admin can
 * share the link by hand. Creation never fails because email is down,
 * and the service never claims an email went out when it did not.
 *
 * The OFFICIAL_ADMINS allowlist in first-run.ts is NOT extended here —
 * invitations are the general mechanism; first-run stays the two
 * officials only.
 */
import { randomBytes } from 'node:crypto';
import { hashPassword, hashToken, normalizeEmail, validatePassword } from '../security';
import { isFullAdmin, normaliseAdminPermissions, type AdminPermissions } from '../admin-access';
import { hasAdminCapability } from '../rbac';
import { buildAdminPortalUrl, buildInvitationUrl, getAppBaseUrl, sendInvitationEmail, type EmailTransport } from '../email/resend';
import {
  createInvitation,
  deleteInvitation,
  getInvitationById,
  getInvitationByTokenHash,
  listInvitations,
  listPendingInvitationsForEmail,
  markInvitationUsed,
} from '../db/invitations';
import { createUser, getUserByEmail, getUserById, updateUser } from '../db/users';
import { logAudit } from '../db/audit';
import { badRequest, conflict, forbidden, notFound, type ServiceError } from './errors';
import type { Invitation, InvitationGrants, SafeUser } from '../db/types';

/**
 * Invitation lifetime: 7 days. Long enough for an invitee to see the
 * email and pick a password, short enough that a forgotten invite does
 * not stay live forever. An expired invitation is never accepted; the
 * admin revokes it and sends a fresh one (or uses Resend, which mints
 * a new token + a new 7-day window).
 */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITATION_TTL_DAYS = 7;

export type InvitationStatus = 'pending' | 'used' | 'expired';

/** An invitation as returned by the admin APIs — never includes tokenHash. */
export interface PublicInvitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  contactNumber?: string;
  grants: InvitationGrants;
  expiresAt: string;
  usedAt: string | null;
  invitedById: string;
  createdAt: string;
  status: InvitationStatus;
}

export function invitationStatus(inv: Invitation, now: number = Date.now()): InvitationStatus {
  if (inv.usedAt != null) return 'used';
  if (new Date(inv.expiresAt).getTime() <= now) return 'expired';
  return 'pending';
}

export function toPublicInvitation(inv: Invitation, now: number = Date.now()): PublicInvitation {
  const { tokenHash: _tokenHash, ...rest } = inv;
  void _tokenHash;
  return { ...rest, usedAt: inv.usedAt ?? null, status: invitationStatus(inv, now) };
}

async function getFullAdminActor(actorId: string): Promise<SafeUser | ServiceError> {
  const actor = await getUserById(actorId);
  if (!actor) return notFound('Admin user');
  if (!hasAdminCapability(actor) || !isFullAdmin(actor.adminPermissions)) {
    return forbidden('Full admin access required');
  }
  return actor;
}

export interface CreateInvitationInput {
  firstName: string;
  lastName: string;
  email: string;
  contactNumber?: string;
  /** The invitee is also a teacher (keeps the teacher flag + instructor home portal). */
  isTeacher?: boolean;
  /** Per-area grants from the checkbox form (area key -> granted). Omitted / all areas = full admin. */
  permissions?: Record<string, unknown>;
}

export interface CreateInvitationOptions {
  now?: number;
  /** Request origin (or NEXT_PUBLIC_APP_URL fallback) used to build the invite link. */
  baseUrl?: string;
  /** Test seam: fake Resend transport (see lib/email/resend.ts). */
  transport?: EmailTransport;
}

export interface CreatedInvitation {
  invitation: PublicInvitation;
  /** Copyable accept link (contains the raw token — only available at creation/resend time). */
  inviteUrl: string;
  /**
   * Secret admin sign-in page URL (PR #33). The admin area is not
   * linked anywhere public, so the inviting admin copies this to the
   * invitee along with the accept link, and the invitee saves it.
   */
  portalUrl: string;
  /** True only when the activation email was actually sent. False = Resend not configured or send failed; share inviteUrl by hand. */
  emailSent: boolean;
}

function validateInvitationDetails(input: CreateInvitationInput): string | null {
  if (!input.firstName?.trim()) return 'First name is required';
  if (!input.lastName?.trim()) return 'Last name is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(input.email ?? ''))) {
    return 'Valid email required';
  }
  return null;
}

async function sendInviteEmail(
  email: string,
  name: string,
  token: string,
  baseUrl: string,
  transport?: EmailTransport,
): Promise<boolean> {
  try {
    const result = await sendInvitationEmail(email, name, token, baseUrl, INVITATION_TTL_DAYS, {
      transport,
    });
    return result.sent;
  } catch (error) {
    console.error('[invitation] Failed to send invitation email:', error);
    return false;
  }
}

/**
 * Create an invitation for a person with no account yet (Case B of the
 * admin "Grant Admin Access" flow). Fails when the email already has an
 * account (grant admin to the existing account instead — Case A) or
 * when a pending invitation already exists for the email.
 */
export async function createInvitationForAdmin(
  actorId: string,
  input: CreateInvitationInput,
  opts: CreateInvitationOptions = {},
): Promise<CreatedInvitation | ServiceError> {
  const actor = await getFullAdminActor(actorId);
  if ('error' in actor) return actor;
  const detailError = validateInvitationDetails(input);
  if (detailError) return badRequest(detailError);

  const email = normalizeEmail(input.email);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const contactNumber = input.contactNumber?.trim() || undefined;
  const permissions = normaliseAdminPermissions(input.permissions);
  const grants: InvitationGrants = {
    isAdmin: true,
    isTeacher: input.isTeacher === true ? true : undefined,
    // Full admin stores NULL (no restriction); restricted stores the map.
    adminPermissions: permissions === undefined ? null : permissions,
  };

  if (await getUserByEmail(email)) {
    return conflict(
      'An account with this email already exists. Grant admin access to the existing account instead of inviting.',
    );
  }
  const pending = await listPendingInvitationsForEmail(email);
  if (pending.length > 0) {
    return conflict(
      'An invitation is already pending for this email. Revoke it before sending a new one.',
    );
  }

  const now = opts.now ?? Date.now();
  const token = randomBytes(32).toString('hex');
  const baseUrl = getAppBaseUrl(opts.baseUrl);
  const invitation = await createInvitation({
    email,
    firstName,
    lastName,
    contactNumber,
    grants,
    tokenHash: hashToken(token),
    expiresAt: new Date(now + INVITATION_TTL_MS),
    invitedById: actorId,
  });
  const emailSent = await sendInviteEmail(email, `${firstName} ${lastName}`, token, baseUrl, opts.transport);
  await logAudit({
    actorId,
    action: 'admin.invitation.create',
    entity: 'invitation',
    entityId: invitation.id,
    detail: `${email} invited as admin${emailSent ? ' (email sent)' : ' (email not configured — link copied by admin)'}`,
  });
  return {
    invitation: toPublicInvitation(invitation, now),
    inviteUrl: buildInvitationUrl(baseUrl, token),
    portalUrl: buildAdminPortalUrl(baseUrl),
    emailSent,
  };
}

/** All invitations (newest first), with a computed status, for the admin list. Full admins only. */
export async function listInvitationsForAdmin(
  actorId: string,
  opts: { now?: number } = {},
): Promise<{ invitations: PublicInvitation[] } | ServiceError> {
  const actor = await getFullAdminActor(actorId);
  if ('error' in actor) return actor;
  const now = opts.now ?? Date.now();
  const invitations = await listInvitations();
  return { invitations: invitations.map((inv) => toPublicInvitation(inv, now)) };
}

/**
 * Revoke (delete) an unused invitation. A used invitation is history
 * and cannot be revoked; an expired one can (it is just cleaned up).
 * The invited person never had an account, so there is nothing else to
 * undo — no user row, no sessions, no data.
 */
export async function revokeInvitation(
  actorId: string,
  invitationId: string,
): Promise<{ success: true } | ServiceError> {
  const actor = await getFullAdminActor(actorId);
  if ('error' in actor) return actor;
  const invitation = await getInvitationById(invitationId);
  if (!invitation) return notFound('Invitation');
  if (invitation.usedAt != null) {
    return badRequest('This invitation has already been used and cannot be revoked');
  }
  const deleted = await deleteInvitation(invitationId);
  if (!deleted) return notFound('Invitation');
  await logAudit({
    actorId,
    action: 'admin.invitation.revoke',
    entity: 'invitation',
    entityId: invitationId,
    detail: `${invitation.email} invitation revoked`,
  });
  return { success: true };
}

/**
 * Resend an invitation: the old (pending or expired) invitation is
 * revoked and a fresh one is created with the same details and grants,
 * a new token and a new 7-day window. The old link stops working —
 * the old token hash is gone with the old row. A used invitation
 * cannot be resent (the account already exists).
 */
export async function resendInvitation(
  actorId: string,
  invitationId: string,
  opts: CreateInvitationOptions = {},
): Promise<CreatedInvitation | ServiceError> {
  const actor = await getFullAdminActor(actorId);
  if ('error' in actor) return actor;
  const old = await getInvitationById(invitationId);
  if (!old) return notFound('Invitation');
  if (old.usedAt != null) {
    return badRequest('This invitation has already been used and cannot be resent');
  }
  await deleteInvitation(invitationId);
  const recreated = await createInvitationForAdmin(
    actorId,
    {
      firstName: old.firstName,
      lastName: old.lastName,
      email: old.email,
      contactNumber: old.contactNumber,
      isTeacher: old.grants.isTeacher,
      // Round-trip the stored grants: null = full admin, a map = restricted.
      permissions:
        old.grants.adminPermissions === null || old.grants.adminPermissions === undefined
          ? undefined
          : (old.grants.adminPermissions as unknown as Record<string, unknown>),
    },
    opts,
  );
  if ('error' in recreated) return recreated;
  await logAudit({
    actorId,
    action: 'admin.invitation.resend',
    entity: 'invitation',
    entityId: recreated.invitation.id,
    detail: `${old.email} invitation resent (replaces ${invitationId})`,
  });
  return recreated;
}

export interface InvitationPreview {
  email: string;
  firstName: string;
  lastName: string;
  expiresAt: string;
}

/**
 * Look up an invitation by its raw token for the accept page (prefill
 * the email, read-only). The token is unguessable, so returning the
 * invitee's name/email for a valid token leaks nothing. Invalid,
 * expired and used tokens all get the same generic error.
 */
export async function getInvitationPreview(
  token: string,
  opts: { now?: number } = {},
): Promise<InvitationPreview | { error: string }> {
  const now = opts.now ?? Date.now();
  const invitation = await getInvitationByTokenHash(hashToken(token));
  if (
    !invitation ||
    invitation.usedAt != null ||
    new Date(invitation.expiresAt).getTime() <= now
  ) {
    return { error: 'This invitation link is invalid or has expired' };
  }
  return {
    email: invitation.email,
    firstName: invitation.firstName,
    lastName: invitation.lastName,
    expiresAt: invitation.expiresAt,
  };
}

/**
 * Accept an invitation: the invitee sets their OWN password (min 8,
 * bcrypt-hashed, cost 12 — same as first-run setup) and the stored
 * grants are applied. A teacher invitee stays a teacher (primary role
 * 'instructor', isTeacher kept); a non-teacher admin gets primary role
 * 'admin'. A missing per-area map means full admin (adminPermissions
 * NULL). Single-use: the token is marked used before the account is
 * created, so a second accept of the same token finds nothing — and a
 * duplicate claim (an account created for the email meanwhile) is
 * rejected without consuming the token.
 */
export async function acceptInvitation(
  token: string,
  password: string,
  opts: { now?: number } = {},
): Promise<{ user: SafeUser } | { error: string }> {
  const now = opts.now ?? Date.now();
  const invitation = await getInvitationByTokenHash(hashToken(token));
  if (
    !invitation ||
    invitation.usedAt != null ||
    new Date(invitation.expiresAt).getTime() <= now
  ) {
    return { error: 'This invitation link is invalid or has expired' };
  }
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  if (await getUserByEmail(invitation.email)) {
    return { error: 'An account with this email already exists. Please sign in instead.' };
  }
  const used = await markInvitationUsed(invitation.id);
  if (!used) return { error: 'This invitation link is invalid or has expired' };

  const grants = invitation.grants;
  const isTeacher = grants.isTeacher === true;
  const user = await createUser({
    name: `${invitation.firstName} ${invitation.lastName}`.trim(),
    email: invitation.email,
    passwordHash: await hashPassword(password),
    // Teacher invitees keep the instructor home portal; the admin flag
    // alone confers admin capability (same flag rule as a direct grant).
    role: isTeacher ? 'instructor' : 'admin',
    phone: invitation.contactNumber,
    isAdmin: grants.isAdmin === true,
    isTeacher,
  });
  // createUser has no adminPermissions input: apply the restriction
  // (or explicit NULL = full admin) right after creation.
  const updated = await updateUser(user.id, {
    adminPermissions: grants.adminPermissions === undefined ? null : grants.adminPermissions,
  });
  await logAudit({
    actorId: user.id,
    action: 'admin.invitation.accept',
    entity: 'user',
    entityId: user.id,
    detail: `${invitation.email} accepted invitation (${isTeacher ? 'teacher + ' : ''}admin)`,
  });
  return { user: updated ?? user };
}

export type { AdminPermissions };
