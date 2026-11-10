/**
 * First-run admin setup (master prompt §8, Phase 2).
 *
 * The two official administrators set their own passwords through this
 * flow. Passwords are NEVER invented or hardcoded — not here, not in
 * seed data, not in INITIAL_CREDENTIALS.txt. The seed admin-1
 * 'Ahmad Hassan' <admin@codebettle.com> is a DEMO account, not the real
 * CEO; the real Ahmad Hassan claims his account here with his real
 * email (ahmad.hassan.hnd@gmail.com).
 *
 * Rules:
 * - Only the two approved emails can be claimed (case-insensitive).
 * - The name comes from the approved list, never from user input.
 * - Setup closes once both accounts exist; afterwards the setup page
 *   redirects to login.
 * - A claimed email cannot be claimed twice.
 */
import { hashPassword, normalizeEmail, validatePassword } from '../security';
import { createUser, getUserByEmail } from '../db/users';
import { logAudit } from '../db/audit';
import type { SafeUser } from '../db/types';

export interface OfficialAdmin {
  name: string;
  title: string;
  email: string;
}

/** The only two people who may hold an admin account. Never add to this list without Eman's say-so. */
export const OFFICIAL_ADMINS: readonly OfficialAdmin[] = [
  { name: 'Muhammad Hateem Hussain', title: 'COO', email: 'mhateemjutt1412@gmail.com' },
  { name: 'Ahmad Hassan', title: 'CEO', email: 'ahmad.hassan.hnd@gmail.com' },
] as const;

/** Is this email one of the two approved administrator emails? (case-insensitive) */
export function isOfficialAdminEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return OFFICIAL_ADMINS.some((a) => a.email === normalized);
}

export interface SetupStatusEntry {
  name: string;
  title: string;
  email: string;
  claimed: boolean;
}

export interface SetupStatus {
  admins: SetupStatusEntry[];
  /** True once both official admins have claimed their accounts. */
  complete: boolean;
}

/** Which official admin accounts exist already (no sensitive data). */
export async function getSetupStatus(): Promise<SetupStatus> {
  const admins: SetupStatusEntry[] = [];
  for (const official of OFFICIAL_ADMINS) {
    const existing = await getUserByEmail(official.email);
    admins.push({ ...official, claimed: existing !== null });
  }
  return { admins, complete: admins.every((a) => a.claimed) };
}

/**
 * Claim one official admin account. The email must match an approved
 * admin; the password is the admin's own choice (bcrypt-hashed, cost 12).
 */
export async function completeFirstRunSetup(
  email: string,
  password: string,
): Promise<{ user: SafeUser } | { error: string }> {
  const normalized = normalizeEmail(email);
  const official = OFFICIAL_ADMINS.find((a) => a.email === normalized);
  if (!official) {
    return { error: 'This email is not an approved administrator account' };
  }
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  if (await getUserByEmail(normalized)) {
    return { error: 'This administrator account is already set up' };
  }

  const user = await createUser({
    name: official.name,
    email: normalized,
    passwordHash: await hashPassword(password),
    role: 'admin',
  });
  await logAudit({
    actorId: user.id,
    action: 'admin.first-run-setup',
    entity: 'user',
    entityId: user.id,
    detail: `${official.title} ${normalized}`,
  });
  return { user };
}
