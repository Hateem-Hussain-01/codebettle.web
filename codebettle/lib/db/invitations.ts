/**
 * Invitation repository (Phase 2, Module 22 — roles & recruitment).
 *
 * Same token pattern as lib/db/password-resets.ts and
 * lib/db/email-verifications.ts: only the SHA-256 hash of the raw token
 * is stored (see hashToken in lib/security.ts) — never the raw token.
 * An invitation is single-use (usedAt) and expires (expiresAt). The
 * single-use rule is enforced in markInvitationUsed, which only
 * matches rows whose usedAt is still NULL, so a second accept of the
 * same token finds nothing. Token generation / expiry policy lives in
 * the invitation service (Phase 2 feature work); this file only
 * persists and looks up rows.
 */
import { getDb } from './client';
import { dateToString } from './mappers';
import { toAdminPermissions } from '../admin-access';
import type { Invitation, InvitationGrants, InvitationRow } from './types';

/** Safely read the Invitation.grants Json column (invalid -> empty grants). */
export function toInvitationGrants(value: unknown): InvitationGrants {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const v = value as Record<string, unknown>;
  const out: InvitationGrants = {};
  if (typeof v.isAdmin === 'boolean') out.isAdmin = v.isAdmin;
  if (typeof v.isTeacher === 'boolean') out.isTeacher = v.isTeacher;
  if ('adminPermissions' in v) {
    // null = full admin; a map = restricted admin; anything else dropped.
    out.adminPermissions =
      v.adminPermissions === null ? null : toAdminPermissions(v.adminPermissions);
  }
  return out;
}

export function mapInvitationRow(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    contactNumber: row.contactNumber ?? undefined,
    grants: toInvitationGrants(row.grants),
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt.toISOString(),
    usedAt: row.usedAt ? row.usedAt.toISOString() : null,
    invitedById: row.invitedById,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface CreateInvitationInput {
  email: string;
  firstName: string;
  lastName: string;
  contactNumber?: string;
  grants: InvitationGrants;
  tokenHash: string;
  expiresAt: Date;
  invitedById: string;
}

/** Create an invitation row. The caller passes the SHA-256 token hash, never the raw token. */
export async function createInvitation(input: CreateInvitationInput): Promise<Invitation> {
  const row = await getDb().orm.public.Invitation.create({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    contactNumber: input.contactNumber ?? null,
    // JSON round-trip: InvitationGrants is a type alias with an index
    // signature, but the parsed value is plain JSON either way.
    grants: JSON.parse(JSON.stringify(input.grants)),
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    invitedById: input.invitedById,
  });
  return mapInvitationRow(row);
}

/** Find an invitation by its token hash. Returns null for an unknown hash. Callers must still check usedAt / expiresAt. */
export async function getInvitationByTokenHash(tokenHash: string): Promise<Invitation | null> {
  const row = await getDb().orm.public.Invitation.where({ tokenHash }).first();
  if (!row) return null;
  return mapInvitationRow(row);
}

/** Find an invitation by id (admin list/detail). */
export async function getInvitationById(id: string): Promise<Invitation | null> {
  const row = await getDb().orm.public.Invitation.where({ id }).first();
  if (!row) return null;
  return mapInvitationRow(row);
}

/**
 * Mark an invitation used. Only matches rows whose usedAt is still
 * NULL, so a second accept of the same token returns false — the
 * single-use guarantee, enforced here as well as in the service.
 */
export async function markInvitationUsed(id: string): Promise<boolean> {
  const row = await getDb()
    .orm.public.Invitation.where({ id })
    .where((i) => i.usedAt.isNull())
    .update({ usedAt: new Date() });
  return row !== null;
}

/** All invitations, newest first (admin list). */
export async function listInvitations(): Promise<Invitation[]> {
  const rows = await getDb()
    .orm.public.Invitation.orderBy((i) => i.createdAt.desc())
    .all();
  return rows.map(mapInvitationRow);
}

/**
 * Delete an invitation row (Module 18: a full admin revoking an unused
 * invitation). Returns false when the invitation does not exist. Only
 * the service calls this, and only for unused invitations — a used
 * invitation is history, not something to erase.
 */
export async function deleteInvitation(id: string): Promise<boolean> {
  const row = await getDb().orm.public.Invitation.where({ id }).delete();
  return row !== null;
}

/** Pending (unused, unexpired) invitations for one email, newest first. */
export async function listPendingInvitationsForEmail(email: string): Promise<Invitation[]> {
  const rows = await getDb()
    .orm.public.Invitation.where((i) => i.email.eq(email))
    .where((i) => i.usedAt.isNull())
    .where((i) => i.expiresAt.gt(new Date()))
    .orderBy((i) => i.createdAt.desc())
    .all();
  return rows.map(mapInvitationRow);
}
