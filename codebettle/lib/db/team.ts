/**
 * Team Portal repository (Eman, 16 Nov 2026) — the 4th portal, for the
 * CodeBettle team (About Us people EXCEPT teachers: management +
 * department heads).
 *
 * Access is by email grant, never a shared secret: an admin grants team
 * access by email (TeamAccess) and the member signs in with their OWN
 * email + password; the grant links to their account by email on
 * login/register. Revoke keeps the row for audit.
 *
 * FAIL-SAFE (same shape as lib/db/ambassadors.ts): the TeamAccess /
 * TeamTask / TeamAnnouncement / TeamMeeting / TeamFile tables exist
 * only after Eman runs codebettle-team-portal-migration.sql in the
 * Supabase SQL Editor (migration
 * 20261116T1710_add_team_portal). Until then every read returns its
 * empty fallback and every write throws the "not set up yet" message
 * — the team portal shows a friendly setup notice instead of a 500,
 * and post-login landing treats everyone as non-team.
 */
import { getDb } from './client';
import {
  mapTeamAccessRow,
  mapTeamAnnouncementRow,
  mapTeamFileRow,
  mapTeamMeetingRow,
  mapTeamTaskRow,
} from './mappers';
import type {
  TeamAccess,
  TeamAnnouncement,
  TeamFile,
  TeamMeeting,
  TeamTask,
  TeamTaskStatus,
} from './types';
import { getUserByEmail } from './users';

const TEAM_TABLES = ['TeamAccess', 'TeamTask', 'TeamAnnouncement', 'TeamMeeting', 'TeamFile'];

/** True when the error is "relation does not exist" for one of the team tables (migration not run yet). */
export function isMissingTeamTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  const namesTable = TEAM_TABLES.some((t) => text.includes(t));
  if (code === '42P01' && namesTable) return true;
  return /relation .* does not exist/i.test(text) && namesTable;
}

export const TEAM_TABLE_MISSING_MESSAGE =
  'The team portal tables are not set up yet — run codebettle-team-portal-migration.sql in the Supabase SQL Editor first.';

/** Cheap probe: true when the TeamAccess table exists (migration has run). */
export async function isTeamTableReady(): Promise<boolean> {
  try {
    await getDb().orm.public.TeamAccess.orderBy((a) => a.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isMissingTeamTableError(error)) return false;
    throw error;
  }
}

/** A read that returns the fallback when a team table is missing, instead of throwing. */
async function withTeamTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingTeamTableError(error)) return fallback;
    throw error;
  }
}

function throwIfTableMissing(error: unknown): never {
  if (isMissingTeamTableError(error)) {
    throw new Error(TEAM_TABLE_MISSING_MESSAGE);
  }
  throw error;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export async function getTeamAccessByEmail(email: string): Promise<TeamAccess | null> {
  const normalized = normalizeEmail(email);
  return withTeamTableFallback(async () => {
    const row = await getDb().orm.public.TeamAccess.where({ email: normalized }).first();
    if (!row) return null;
    return mapTeamAccessRow(row as never);
  }, null);
}

export async function getTeamAccessByUserId(userId: string): Promise<TeamAccess | null> {
  return withTeamTableFallback(async () => {
    const row = await getDb().orm.public.TeamAccess.where({ userId }).first();
    if (!row) return null;
    return mapTeamAccessRow(row as never);
  }, null);
}

export async function getTeamAccessById(id: string): Promise<TeamAccess | null> {
  return withTeamTableFallback(async () => {
    const row = await getDb().orm.public.TeamAccess.where({ id }).first();
    if (!row) return null;
    return mapTeamAccessRow(row as never);
  }, null);
}

/** All access grants, newest first (admin). Empty when the table is missing. */
export async function listTeamAccess(): Promise<TeamAccess[]> {
  return withTeamTableFallback(async () => {
    const rows = await getDb().orm.public.TeamAccess.orderBy((a) => a.createdAt.desc()).all();
    return rows.map((r) => mapTeamAccessRow(r as never));
  }, []);
}

/**
 * True when the user holds ACTIVE team access — by linked userId, or
 * by a grant on their email (covers a grant made before the account
 * existed, before the link-up has run). False when the table is
 * missing (fail-safe: the portal is inert until the SQL runs).
 * Never throws for a missing table.
 */
export async function hasTeamAccess(user: { id: string; email: string } | null | undefined): Promise<boolean> {
  if (!user) return false;
  try {
    const byUser = await getTeamAccessByUserId(user.id);
    if (byUser) return byUser.status === 'active';
    const byEmail = await getTeamAccessByEmail(user.email);
    return byEmail !== null && byEmail.status === 'active';
  } catch (error) {
    if (isMissingTeamTableError(error)) return false;
    throw error;
  }
}

export interface GrantTeamAccessInput {
  email: string;
  grantedBy: string;
}

/**
 * Grant team access by email. Idempotent: an existing grant for the
 * email is returned (and re-activated when it was revoked — a
 * re-grant after a revoke is a fresh grant, not a second row). Links
 * the grant to the account when one already exists with the email.
 */
export async function grantTeamAccess(input: GrantTeamAccessInput): Promise<TeamAccess> {
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Valid email required');
  }
  const existing = await getTeamAccessByEmail(email);
  if (existing) {
    if (existing.status === 'active') return existing;
    try {
      const reactivated = await getDb()
        .orm.public.TeamAccess.where({ id: existing.id })
        .update({ status: 'active', grantedBy: input.grantedBy, grantedAt: new Date(), revokedAt: null });
      return mapTeamAccessRow(reactivated as never);
    } catch (error) {
      throwIfTableMissing(error);
    }
  }
  try {
    const account = await getUserByEmail(email).catch(() => null);
    const row = await getDb().orm.public.TeamAccess.create({
      email,
      userId: account?.id ?? null,
      status: 'active',
      grantedBy: input.grantedBy,
    });
    return mapTeamAccessRow(row as never);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

/**
 * Revoke team access by email. The row stays (audit); the member loses
 * access immediately. Returns null when no grant exists for the email.
 */
export async function revokeTeamAccess(email: string): Promise<TeamAccess | null> {
  const existing = await getTeamAccessByEmail(normalizeEmail(email));
  if (!existing) return null;
  if (existing.status === 'revoked') return existing;
  try {
    const updated = await getDb()
      .orm.public.TeamAccess.where({ id: existing.id })
      .update({ status: 'revoked', revokedAt: new Date() });
    return mapTeamAccessRow(updated as never);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

/**
 * Link a team-access grant to a user account by email. Best-effort and
 * never throws for a missing table: called on login/register, where a
 * linking failure must never block sign-in. Links only when the row
 * is still unlinked (userId null) — an already-linked row is left
 * alone, and a row linked to someone else is never stolen.
 */
export async function linkTeamAccessToUserByEmail(email: string, userId: string): Promise<TeamAccess | null> {
  try {
    const grant = await getTeamAccessByEmail(email);
    if (!grant) return null;
    if (grant.userId) return grant.userId === userId ? grant : null;
    const updated = await getDb()
      .orm.public.TeamAccess.where({ id: grant.id })
      .where((a) => a.userId.isNull())
      .update({ userId });
    if (!updated) return grant;
    return mapTeamAccessRow(updated as never);
  } catch (error) {
    if (isMissingTeamTableError(error)) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** All team tasks, newest first. Empty when the table is missing. */
export async function listTeamTasks(): Promise<TeamTask[]> {
  return withTeamTableFallback(async () => {
    const rows = await getDb().orm.public.TeamTask.orderBy((t) => t.createdAt.desc()).all();
    return rows.map((r) => mapTeamTaskRow(r as never));
  }, []);
}

/** Tasks assigned to one member (by email), newest first. */
export async function listTeamTasksForAssignee(email: string): Promise<TeamTask[]> {
  const normalized = normalizeEmail(email);
  return withTeamTableFallback(async () => {
    const rows = await getDb()
      .orm.public.TeamTask.where({ assigneeEmail: normalized })
      .orderBy((t) => t.createdAt.desc())
      .all();
    return rows.map((r) => mapTeamTaskRow(r as never));
  }, []);
}

export async function getTeamTaskById(id: string): Promise<TeamTask | null> {
  return withTeamTableFallback(async () => {
    const row = await getDb().orm.public.TeamTask.where({ id }).first();
    if (!row) return null;
    return mapTeamTaskRow(row as never);
  }, null);
}

export interface CreateTeamTaskInput {
  title: string;
  description?: string;
  assigneeEmail: string;
  dueDate?: string;
  createdBy: string;
}

export async function createTeamTask(input: CreateTeamTaskInput): Promise<TeamTask> {
  const title = input.title.trim();
  if (!title) throw new Error('Title is required');
  const assigneeEmail = normalizeEmail(input.assigneeEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeEmail)) {
    throw new Error('Valid assignee email required');
  }
  try {
    const row = await getDb().orm.public.TeamTask.create({
      title,
      description: input.description?.trim() || null,
      assigneeEmail,
      status: 'todo',
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      createdBy: input.createdBy,
    });
    return mapTeamTaskRow(row as never);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

/** The one-step-forward moves a member may make: todo -> doing -> done. */
export const TEAM_TASK_FORWARD_MOVE: Record<Exclude<TeamTaskStatus, 'done'>, TeamTaskStatus> = {
  todo: 'doing',
  doing: 'done',
};

/**
 * Move a task to a new status.
 * - Members: only the assignee, only one step forward (todo -> doing,
 *   doing -> done). Anything else is refused (returns null).
 * - Admins (`byAdmin`): any status, any task.
 * Returns the updated task, or null when the move is not allowed / the
 * task does not exist.
 */
export async function moveTeamTaskStatus(
  id: string,
  next: TeamTaskStatus,
  actor: { id: string; email: string; isAdmin: boolean },
): Promise<TeamTask | null> {
  const task = await getTeamTaskById(id);
  if (!task) return null;
  if (!actor.isAdmin) {
    if (normalizeEmail(task.assigneeEmail) !== normalizeEmail(actor.email)) return null;
    if (task.status === 'done') return null;
    if (TEAM_TASK_FORWARD_MOVE[task.status] !== next) return null;
  }
  try {
    const updated = await getDb()
      .orm.public.TeamTask.where({ id })
      .update({ status: next });
    if (!updated) return null;
    return mapTeamTaskRow(updated as never);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

export interface UpdateTeamTaskInput {
  title?: string;
  description?: string | null;
  assigneeEmail?: string;
  dueDate?: string | null;
  status?: TeamTaskStatus;
}

/**
 * Admin task edit (title / description / assignee / due date /
 * status). The route guard is the enforcement (admin `team` area);
 * this function does no role check itself. Returns null when the
 * task does not exist.
 */
export async function updateTeamTask(id: string, input: UpdateTeamTaskInput): Promise<TeamTask | null> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new Error('Title is required');
    patch.title = title;
  }
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.assigneeEmail !== undefined) {
    const assigneeEmail = normalizeEmail(input.assigneeEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeEmail)) {
      throw new Error('Valid assignee email required');
    }
    patch.assigneeEmail = assigneeEmail;
  }
  if (input.dueDate !== undefined) {
    patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  }
  if (input.status !== undefined) patch.status = input.status;
  try {
    const updated = await getDb().orm.public.TeamTask.where({ id }).update(patch);
    if (!updated) return null;
    return mapTeamTaskRow(updated as never);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/** All team announcements, newest first. Empty when the table is missing. */
export async function listTeamAnnouncements(): Promise<TeamAnnouncement[]> {
  return withTeamTableFallback(async () => {
    const rows = await getDb().orm.public.TeamAnnouncement.orderBy((a) => a.createdAt.desc()).all();
    return rows.map((r) => mapTeamAnnouncementRow(r as never));
  }, []);
}

export interface CreateTeamAnnouncementInput {
  title: string;
  body: string;
  createdBy: string;
}

export async function createTeamAnnouncement(input: CreateTeamAnnouncementInput): Promise<TeamAnnouncement> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error('Title is required');
  if (!body) throw new Error('Body is required');
  try {
    const row = await getDb().orm.public.TeamAnnouncement.create({
      title,
      body,
      createdBy: input.createdBy,
    });
    return mapTeamAnnouncementRow(row as never);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

/** Upcoming meetings (startsAt >= now), soonest first. Empty when the table is missing. */
export async function listUpcomingTeamMeetings(now: Date = new Date()): Promise<TeamMeeting[]> {
  return withTeamTableFallback(async () => {
    const rows = await getDb()
      .orm.public.TeamMeeting.where((m) => m.startsAt.gte(now))
      .orderBy((m) => m.startsAt.asc())
      .all();
    return rows.map((r) => mapTeamMeetingRow(r as never));
  }, []);
}

/** All meetings, soonest first (admin). Empty when the table is missing. */
export async function listTeamMeetings(): Promise<TeamMeeting[]> {
  return withTeamTableFallback(async () => {
    const rows = await getDb().orm.public.TeamMeeting.orderBy((m) => m.startsAt.asc()).all();
    return rows.map((r) => mapTeamMeetingRow(r as never));
  }, []);
}

export interface CreateTeamMeetingInput {
  title: string;
  startsAt: string;
  meetingLink?: string;
  agenda?: string;
  createdBy: string;
}

export async function createTeamMeeting(input: CreateTeamMeetingInput): Promise<TeamMeeting> {
  const title = input.title.trim();
  if (!title) throw new Error('Title is required');
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new Error('Valid start date and time required');
  try {
    const row = await getDb().orm.public.TeamMeeting.create({
      title,
      startsAt,
      meetingLink: input.meetingLink?.trim() || null,
      agenda: input.agenda?.trim() || null,
      createdBy: input.createdBy,
    });
    return mapTeamMeetingRow(row as never);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** All shared team files, newest first. Empty when the table is missing. */
export async function listTeamFiles(): Promise<TeamFile[]> {
  return withTeamTableFallback(async () => {
    const rows = await getDb().orm.public.TeamFile.orderBy((f) => f.createdAt.desc()).all();
    return rows.map((r) => mapTeamFileRow(r as never));
  }, []);
}

export async function getTeamFileById(id: string): Promise<TeamFile | null> {
  return withTeamTableFallback(async () => {
    const row = await getDb().orm.public.TeamFile.where({ id }).first();
    if (!row) return null;
    return mapTeamFileRow(row as never);
  }, null);
}

export interface CreateTeamFileInput {
  fileName: string;
  storagePath: string;
  mime: string;
  size: number;
  uploadedBy: string;
}

export async function createTeamFile(input: CreateTeamFileInput): Promise<TeamFile> {
  const fileName = input.fileName.trim();
  if (!fileName) throw new Error('File name is required');
  if (!input.storagePath) throw new Error('Storage path is required');
  try {
    const row = await getDb().orm.public.TeamFile.create({
      fileName,
      storagePath: input.storagePath,
      mime: input.mime,
      size: input.size,
      uploadedBy: input.uploadedBy,
    });
    return mapTeamFileRow(row as never);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

export async function deleteTeamFile(id: string): Promise<TeamFile | null> {
  try {
    const deleted = await getDb().orm.public.TeamFile.where({ id }).delete();
    if (!deleted) return null;
    return mapTeamFileRow(deleted as never);
  } catch (error) {
    throwIfTableMissing(error);
  }
}
