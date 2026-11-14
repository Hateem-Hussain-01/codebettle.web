/**
 * Team member repository (PR #32 — Success Stories Management).
 *
 * FAIL-SAFE (same shape as lib/db/success-stories.ts): the table
 * arrives via migration 20261113T1640_success_stories_management,
 * which Eman runs himself in the Supabase SQL Editor. Until it runs,
 * reads return empty/null and writes return a clear error — the
 * public page shows its honest empty state and the admin section shows
 * a "run the SQL" state. Nothing else breaks.
 */
import { getDb } from './client';
import { mapTeamMemberRow, stripUndefined } from './mappers';
import type { TeamMember, TeamMemberLevel, TeamMemberRow } from './types';
import { compareTeamMembers } from '../management';

/** True when the error is "relation does not exist" for the TeamMember table (migration not run yet). */
export function isMissingTeamMemberTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  if (code === '42P01' && text.includes('TeamMember')) return true;
  return /relation .* does not exist/i.test(text) && text.includes('TeamMember');
}

async function withTeamMemberTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingTeamMemberTableError(error)) return fallback;
    throw error;
  }
}

export const TEAM_MEMBER_TABLES_MISSING_MESSAGE =
  'Team member table is not set up yet — run codebettle-success-stories-mgmt-migration.sql in the Supabase SQL Editor first.';

function throwIfTablesMissing(error: unknown): never {
  if (isMissingTeamMemberTableError(error)) {
    throw new Error(TEAM_MEMBER_TABLES_MISSING_MESSAGE);
  }
  throw error;
}

/** Cheap probe: true when the table exists (migration has run). */
export async function areTeamMemberTablesReady(): Promise<boolean> {
  try {
    await getDb().orm.public.TeamMember.orderBy((m) => m.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isMissingTeamMemberTableError(error)) return false;
    throw error;
  }
}

export interface CreateTeamMemberInput {
  photoUrl?: string | null;
  fullName: string;
  designation: string;
  bio?: string | null;
  xUrl?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  level?: TeamMemberLevel;
  department?: string | null;
  sortOrder?: number;
  enabled?: boolean;
}

/** Next display order: one past the current max, so a new member lands at the end of the flat list. */
async function nextTeamMemberSortOrder(): Promise<number> {
  const members = await listTeamMembers();
  return members.reduce((max, m) => Math.max(max, m.sortOrder), -1) + 1;
}

export async function createTeamMember(input: CreateTeamMemberInput): Promise<TeamMember> {
  try {
    const sortOrder = input.sortOrder ?? (await nextTeamMemberSortOrder());
    const row = await getDb().orm.public.TeamMember.create({
      photoUrl: input.photoUrl ?? null,
      fullName: input.fullName,
      designation: input.designation,
      bio: input.bio ?? null,
      xUrl: input.xUrl ?? null,
      linkedinUrl: input.linkedinUrl ?? null,
      githubUrl: input.githubUrl ?? null,
      websiteUrl: input.websiteUrl ?? null,
      level: input.level ?? 'management',
      department: input.department?.trim() || null,
      sortOrder,
      enabled: input.enabled ?? true,
    });
    return mapTeamMemberRow(row as TeamMemberRow);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export async function getTeamMemberById(id: string): Promise<TeamMember | null> {
  return withTeamMemberTableFallback(async () => {
    const row = await getDb().orm.public.TeamMember.where({ id }).first();
    return row ? mapTeamMemberRow(row as TeamMemberRow) : null;
  }, null);
}

/**
 * Admin list: every member, in global display order (sortOrder, then
 * id). The public page shows the same flat order — no hierarchy
 * grouping (Eman's 14 Nov 2026 change).
 */
export async function listTeamMembers(): Promise<TeamMember[]> {
  return withTeamMemberTableFallback(async () => {
    const rows = await getDb().orm.public.TeamMember.all();
    return rows
      .map((r) => mapTeamMemberRow(r as TeamMemberRow))
      .sort(compareTeamMembers);
  }, []);
}

/** Public list: enabled members only, same hierarchy order. */
export async function listEnabledTeamMembers(): Promise<TeamMember[]> {
  const all = await listTeamMembers();
  return all.filter((m) => m.enabled);
}

export interface UpdateTeamMemberInput {
  photoUrl?: string | null;
  fullName?: string;
  designation?: string;
  bio?: string | null;
  xUrl?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  level?: TeamMemberLevel;
  department?: string | null;
  sortOrder?: number;
  enabled?: boolean;
}

export async function updateTeamMember(id: string, input: UpdateTeamMemberInput): Promise<TeamMember | null> {
  try {
    const updated = await getDb()
      .orm.public.TeamMember.where({ id })
      .update(stripUndefined({ ...input }));
    if (!updated) return null;
    return getTeamMemberById(id);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export async function deleteTeamMember(id: string): Promise<boolean> {
  try {
    const deleted = await getDb().orm.public.TeamMember.where({ id }).delete();
    return deleted !== null;
  } catch (error) {
    throwIfTablesMissing(error);
  }
}
