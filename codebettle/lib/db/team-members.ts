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
import { isMissingColumnError } from './certificates';
import { mapTeamMemberRow, stripUndefined } from './mappers';
import type { TeamMember, TeamMemberLevel, TeamMemberRow } from './types';
import { compareTeamMembers } from '../management';

/** Columns that existed before the visibleSocials migration. */
const LEGACY_TEAM_MEMBER_FIELDS = [
  'id',
  'photoUrl',
  'fullName',
  'designation',
  'bio',
  'xUrl',
  'linkedinUrl',
  'githubUrl',
  'websiteUrl',
  'level',
  'department',
  'sortOrder',
  'enabled',
  'createdAt',
  'updatedAt',
] as const;

/**
 * Run a team-member read, retrying without the visibleSocials column
 * when the migration has not run yet. Same shape as
 * withCourseTemplateColumnFallback in lib/db/courses.ts: the public
 * card falls back to the first 2 filled links, and the admin list
 * keeps working.
 */
async function withTeamMemberColumnFallback<T>(fetch: (legacyOnly: boolean) => Promise<T>): Promise<T> {
  try {
    return await fetch(false);
  } catch (error) {
    if (!isMissingColumnError(error, ['visibleSocials'])) throw error;
    return fetch(true);
  }
}

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

/** The visibleSocials column is missing (migration not run yet) — a write that needs it fails with this, not a bare 500. */
export const TEAM_MEMBER_VISIBLE_SOCIALS_MISSING_MESSAGE =
  'Team member socials choice is not set up yet — run codebettle-team-visible-socials-migration.sql in the Supabase SQL Editor first.';

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
    // Only the visibleSocials column is missing: the table itself is
    // ready — reads fall back and only saving a social choice fails
    // (with a clear message), so the page must not show "run the SQL".
    if (isMissingColumnError(error, ['visibleSocials'])) return true;
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
  /** Comma-separated choice (e.g. 'github,linkedin'), or null for the fallback. Only sent when non-empty. */
  visibleSocials?: string | null;
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
      // Only send the new column when a choice is actually picked, so a
      // plain create does not fail with 42703 before the migration runs.
      ...(input.visibleSocials ? { visibleSocials: input.visibleSocials } : {}),
      level: input.level ?? 'management',
      department: input.department?.trim() || null,
      sortOrder,
      enabled: input.enabled ?? true,
    });
    return mapTeamMemberRow(row as TeamMemberRow);
  } catch (error) {
    // A picked choice needs the column: fail with a clear message
    // telling the admin to run the SQL, not a bare 500.
    if (isMissingColumnError(error, ['visibleSocials'])) {
      throw new Error(TEAM_MEMBER_VISIBLE_SOCIALS_MISSING_MESSAGE);
    }
    throwIfTablesMissing(error);
  }
}

export async function getTeamMemberById(id: string): Promise<TeamMember | null> {
  return withTeamMemberTableFallback(async () => {
    const row = await withTeamMemberColumnFallback(async (legacyOnly) => {
      const base = getDb().orm.public.TeamMember.where({ id });
      // Separate branches (not a reassigned `let`): .select() narrows
      // the collection's row type, so assigning it back is a type error.
      return legacyOnly ? base.select(...LEGACY_TEAM_MEMBER_FIELDS).first() : base.first();
    });
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
    const rows = await withTeamMemberColumnFallback(async (legacyOnly) => {
      // Separate branches (not a reassigned `let`): .select() narrows
      // the collection's row type, so assigning it back is a type error.
      return legacyOnly
        ? getDb().orm.public.TeamMember.select(...LEGACY_TEAM_MEMBER_FIELDS).all()
        : getDb().orm.public.TeamMember.all();
    });
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
  /** Comma-separated choice, or null to clear it (back to the fallback). Only sent when the caller includes it. */
  visibleSocials?: string | null;
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
    // A saved/cleared choice needs the column: fail with a clear
    // message telling the admin to run the SQL, not a bare 500.
    // Updates that never touch visibleSocials (toggle, reorder) do not
    // reach this branch.
    if (isMissingColumnError(error, ['visibleSocials'])) {
      throw new Error(TEAM_MEMBER_VISIBLE_SOCIALS_MISSING_MESSAGE);
    }
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
