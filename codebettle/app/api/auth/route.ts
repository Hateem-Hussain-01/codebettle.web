import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SESSION_COOKIE,
  changePassword,
  createSession,
  destroySession,
  getSession,
  login,
  registerUser,
  sessionCookieOptions,
} from '@/lib/auth';
import {
  changePasswordRateLimitKey,
  checkRateLimitAsync,
  getClientIp,
  loginRateLimitKey,
  registerRateLimitKey,
  resendVerificationRateLimitKey,
} from '@/lib/rate-limit';
import { hasAdminCapability, hasTeacherCapability, matchesLoginPortal, type LoginPortal } from '@/lib/rbac';
import { landingDashboardUrl } from '@/lib/admin-url';
import { recordLoginEvent } from '@/lib/db/login-events';
import { hasTeamAccess } from '@/lib/db/team';
import { getUserByEmail } from '@/lib/db/users';
import { revokeOtherSessionsForUser } from '@/lib/db/sessions';
import { resolveReferralForSignup } from '@/lib/db/ambassadors';
import { resolveTeamReferralForSignup } from '@/lib/db/team-credits';
import { REFERRAL_COOKIE } from '@/lib/referral';
import { normalizeEmail } from '@/lib/security';
import {
  getEmailVerificationStatus,
  requestEmailVerification,
} from '@/lib/services/email-verification-service';
import { isEmailVerificationRequired } from '@/lib/services/settings-service';
import { VIEW_AS_COOKIE } from '@/lib/view-as';

/** Login-event recording is best-effort: it must never block a sign-in. */
async function safeRecordLoginEvent(input: Parameters<typeof recordLoginEvent>[0]): Promise<void> {
  try {
    await recordLoginEvent(input);
  } catch (e) {
    console.error('Failed to record login event', e);
  }
}

/**
 * POST /api/auth — login / register / logout / change-password /
 * resend-verification / revoke-other-sessions.
 *
 * Security rules enforced here (not only in the UI):
 * - All inputs validated server-side with Zod; role can never be chosen
 *   by the caller (registration always creates a student).
 * - Login errors are generic: the same message for unknown email, wrong
 *   password, or suspended account.
 * - Login is rate-limited (5 attempts / 15 min per IP + email, via
 *   the shared async limiter — Upstash Redis when configured, the
 *   in-memory fallback otherwise; see lib/rate-limit.ts).
 * - Registration and change-password are rate-limited too (HIGH-A2):
 *   5 attempts / 15 min per IP (register) / per user (change-password),
 *   through the same async limiter.
 * - Duplicate registration returns the same generic 201 success as a
 *   fresh signup (MEDIUM-A1) — no "already exists" distinction.
 * - When email-verification enforcement is enabled
 *   (security.requireEmailVerification, default OFF), login refuses
 *   unverified accounts with a "verify your email" response and a
 *   resend-verification path (MEDIUM-A2).
 * - Sessions are opaque tokens validated server-side (see lib/auth.ts).
 */

const loginSchema = z.object({
  action: z.literal('login'),
  email: z.string().min(1),
  password: z.string().min(1),
  // The tab the sign-in page had selected. Sent by LoginForm;
  // 'admin' comes from the secret admin sign-in page (its single
  // Admin tab). Optional so older callers keep working. Absent = the
  // default tab ('student') — a crafted request that omits it is
  // treated as a Student-tab sign-in and CANNOT bypass the guard.
  requestedRole: z.enum(['student', 'instructor', 'admin']).optional(),
});

/**
 * Role-mismatch messages, keyed by the tab the caller asked for. For
 * the Student | Instructor tabs the account's actual role is always
 * the other one in a mismatch (a student has no teacher capability,
 * an instructor has no student capability), so the instruction is
 * always accurate. For the Admin tab the account is a student or an
 * instructor, so the message is generic on purpose.
 */
const ROLE_MISMATCH_MESSAGES: Record<LoginPortal, string> = {
  student:
    'This account is registered as an Instructor. Please switch to the Instructor tab to sign in.',
  instructor:
    'This account is registered as a Student. Please switch to the Student tab to sign in.',
  admin:
    'This sign-in is for admins only. Please use the Student or Instructor sign-in instead.',
};

const registerSchema = z.object({
  action: z.literal('register'),
  name: z.string().min(1),
  email: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(1),
  confirmPassword: z.string().optional(),
});

const logoutSchema = z.object({ action: z.literal('logout') });

const resendVerificationSchema = z.object({
  action: z.literal('resend-verification'),
  email: z.string().min(1),
});

const revokeOtherSessionsSchema = z.object({ action: z.literal('revoke-other-sessions') });

const changePasswordSchema = z.object({
  action: z.literal('change-password'),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const action = (body as { action?: unknown })?.action;

  if (action === 'login') {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    const { email, password, requestedRole } = parsed.data;
    const portal: LoginPortal = requestedRole ?? 'student';
    // Trusted IP (HIGH-A3 / U-2): x-real-ip first, else the LAST
    // X-Forwarded-For hop — the first entry is client-forged. The
    // same value is recorded on the login event and the session.
    const ip = getClientIp(request);
    const limit = await checkRateLimitAsync(
      loginRateLimitKey(ip, email),
      5,
      15 * 60 * 1000
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const user = await login(email, password);
    if (!user) {
      // MEDIUM-A2: when verification enforcement is on, an existing
      // but unverified account gets a distinct "verify your email"
      // response (with the resend path) instead of the generic 401.
      // Unknown emails still get the generic 401 — no oracle.
      if (await isEmailVerificationRequired()) {
        const status = await getEmailVerificationStatus(email);
        if (status === 'unverified') {
          await safeRecordLoginEvent({
            email,
            success: false,
            ip,
            userAgent: request.headers.get('user-agent') ?? undefined,
          });
          return NextResponse.json(
            {
              error:
                'Please verify your email address before signing in. Check your inbox for the verification link, or request a new one.',
              emailNotVerified: true,
            },
            { status: 403 },
          );
        }
      }
      // Generic on purpose — never reveal whether the email exists.
      await safeRecordLoginEvent({
        email,
        success: false,
        ip,
        userAgent: request.headers.get('user-agent') ?? undefined,
      });
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }
    // Role-mismatch guard — ONLY after the password is verified, so a
    // wrong password still returns the generic error above and the
    // message cannot be used to enumerate accounts. On mismatch NO
    // session is created: the account stays signed out and the caller
    // is told which tab to use instead.
    if (!matchesLoginPortal(user, portal)) {
      await safeRecordLoginEvent({
        email,
        userId: user.id,
        success: false,
        ip,
        userAgent: request.headers.get('user-agent') ?? undefined,
      });
      return NextResponse.json(
        { error: ROLE_MISMATCH_MESSAGES[portal] },
        { status: 403 }
      );
    }
    await safeRecordLoginEvent({
      email,
      userId: user.id,
      success: true,
      ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });
    const token = await createSession(user.id, {
      ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });
    // dashboardUrl is computed server-side so the client never has to
    // build an admin URL: for admins it is the secret admin dashboard
    // (PR #33), which the browser cannot derive from the env var.
    // Team Portal (Eman, 16 Nov 2026): the landing follows the role
    // priority admin > teacher > team > student — a pure team member
    // lands on /team/dashboard. The team check is fail-safe (false
    // until the team tables exist) and skipped for admins/teachers,
    // who land on their own portal anyway.
    let teamAccess = false;
    if (!hasAdminCapability(user) && !hasTeacherCapability(user)) {
      try {
        teamAccess = await hasTeamAccess(user);
      } catch {
        teamAccess = false;
      }
    }
    const dashboardUrl = landingDashboardUrl({
      role: user.role,
      isAdmin: user.isAdmin,
      isTeacher: user.isTeacher,
      hasTeamAccess: teamAccess,
    });
    const response = NextResponse.json({ user, success: true, dashboardUrl });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    // A fresh sign-in ends any stale view-as state (Phase 2, Module 21.4).
    response.cookies.delete(VIEW_AS_COOKIE);
    return response;
  }

  if (action === 'register') {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 });
    }
    const { name, email, phone, password, confirmPassword } = parsed.data;
    if (confirmPassword !== undefined && confirmPassword !== password) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }
    // HIGH-A2: registration is rate-limited like login (5 / 15 min
    // per IP) — without this, anyone could create unlimited accounts.
    const registerLimit = await checkRateLimitAsync(registerRateLimitKey(getClientIp(request)), 5, 15 * 60 * 1000);
    if (!registerLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429 },
      );
    }
    const result = await registerUser({
      name,
      email,
      phone,
      password,
      // Ambassador referral (Eman, 16 Nov 2026): the referrer comes
      // from the `cb_ref` cookie set when the visitor landed on a
      // referral link — resolved server-side here, never from a
      // client-sent field. resolveReferralForSignup returns null for
      // an unknown/inactive code and for self-referral (the
      // ambassador's own email), so a planted cookie attributes
      // nothing. A missing/unreadable cookie is simply no referrer.
      referredByAmbassadorId:
        (await resolveReferralForSignup(
          request.cookies.get(REFERRAL_COOKIE)?.value ?? '',
          email,
        )) ?? undefined,
      // Team referral (PR B, Eman 16 Nov 2026): the SAME cookie may
      // hold a TEAM member's code instead of an ambassador's —
      // resolved server-side the same way. Exactly one of the two
      // can match: minting checks both namespaces, so a code belongs
      // to one referrer only.
      referredByTeamAccessId:
        (await resolveTeamReferralForSignup(
          request.cookies.get(REFERRAL_COOKIE)?.value ?? '',
          email,
        )) ?? undefined,
    });
    if ('duplicate' in result) {
      // MEDIUM-A1: the same generic 201 success as a fresh signup —
      // no second account is created and nothing reveals that the
      // email is already registered. No session is minted: the caller
      // has not proven they own the existing account.
      return NextResponse.json(
        {
          success: true,
          verificationEmailSent: false,
          message:
            'If this email address is new, your account has been created. Please check your inbox to verify your email.',
        },
        { status: 201 },
      );
    }
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    // Signup verification email (best-effort, never blocks signup):
    // create the token and send the email via Resend. When the key is
    // not configured the send is skipped and the flag is false; the
    // register page reads the flag to show the verification message.
    const verificationEmailSent = (
      await requestEmailVerification(
        result.user.id,
        result.user.email,
        result.user.name,
        request.nextUrl.origin,
      )
    ).sent;
    const created = await login(email, password);
    if (!created) {
      // MEDIUM-A2: with enforcement on, a fresh (unverified) account
      // cannot auto-log-in — the user must verify first. Without
      // enforcement this stays the old "please sign in" fallback.
      if (await isEmailVerificationRequired()) {
        return NextResponse.json(
          {
            success: true,
            verificationEmailSent,
            message: 'Account created. Please verify your email address, then sign in.',
          },
          { status: 201 },
        );
      }
      return NextResponse.json(
        { error: 'Account created. Please sign in.', verificationEmailSent },
        { status: 201 },
      );
    }
    const token = await createSession(created.id, {
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });
    // Team Portal (Eman, 16 Nov 2026): a new account whose email was
    // pre-granted team access lands on the team portal (same priority
    // as login). Fail-safe: false until the team tables exist.
    let registerTeamAccess = false;
    try {
      registerTeamAccess = await hasTeamAccess(created);
    } catch {
      registerTeamAccess = false;
    }
    const response = NextResponse.json(
      {
        user: created,
        success: true,
        verificationEmailSent,
        dashboardUrl: landingDashboardUrl({
          role: created.role,
          isAdmin: created.isAdmin,
          isTeacher: created.isTeacher,
          hasTeamAccess: registerTeamAccess,
        }),
      },
      { status: 201 },
    );
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    // A fresh sign-in ends any stale view-as state (Phase 2, Module 21.4).
    response.cookies.delete(VIEW_AS_COOKIE);
    return response;
  }

  if (action === 'logout') {
    const parsed = logoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    // Phase 2, Module 21.4: while viewing a teacher's portal, logout
    // would revoke the ADMIN's own session (the cookie holds the
    // admin's token) — refuse it and send the admin back via the
    // banner's Return to Admin Panel instead.
    const viewingSession = await getSession();
    if (viewingSession?.viewAs) {
      return NextResponse.json(
        { error: 'You are viewing a teacher portal as an admin. Return to the Admin Panel first, then sign out.' },
        { status: 403 },
      );
    }
    await destroySession();
    const response = NextResponse.json({ success: true });
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(VIEW_AS_COOKIE);
    return response;
  }

  if (action === 'change-password') {
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Current and new passwords are required' }, { status: 400 });
    }
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    // Phase 2, Module 21.4: while viewing, the session is the
    // teacher's — changing the teacher's password from the viewing
    // session must be refused (the admin must return to their own
    // session first).
    if (session.viewAs) {
      return NextResponse.json(
        { error: 'You are viewing a teacher portal as an admin. Return to the Admin Panel first, then change passwords from your own session.' },
        { status: 403 },
      );
    }
    const { currentPassword, newPassword } = parsed.data;
    // HIGH-A2: change-password is rate-limited (5 / 15 min per user)
    // — an authenticated session must not allow unlimited guessing
    // of the current password.
    const changeLimit = await checkRateLimitAsync(changePasswordRateLimitKey(session.id), 5, 15 * 60 * 1000);
    if (!changeLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many password change attempts. Please try again later.' },
        { status: 429 },
      );
    }
    const result = await changePassword(session.id, currentPassword, newPassword);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
    return response;
  }

  if (action === 'resend-verification') {
    const parsed = resendVerificationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const { email } = parsed.data;
    // Rate-limited like login/reset (5 / 15 min per IP + email).
    const limit = await checkRateLimitAsync(
      resendVerificationRateLimitKey(getClientIp(request), email),
      5,
      15 * 60 * 1000,
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many verification requests. Please try again later.' },
        { status: 429 },
      );
    }
    // Generic on purpose — never reveal whether the email has an
    // account or is already verified (no enumeration oracle). Only an
    // existing, still-unverified account gets a new link.
    const user = await getUserByEmail(normalizeEmail(email));
    if (user && (await getEmailVerificationStatus(email)) === 'unverified') {
      await requestEmailVerification(user.id, user.email, user.name, request.nextUrl.origin);
    }
    return NextResponse.json({
      success: true,
      message: 'If an account exists for this email, a verification link has been sent.',
    });
  }

  if (action === 'revoke-other-sessions') {
    const parsed = revokeOtherSessionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    // While viewing, the session is the teacher's — revoking the
    // teacher's other sessions from the viewing session is refused.
    if (session.viewAs) {
      return NextResponse.json(
        { error: 'You are viewing a teacher portal as an admin. Return to the Admin Panel first.' },
        { status: 403 },
      );
    }
    // MEDIUM-A3: revoke every session except the one making this
    // call (identified by the session cookie). The current session
    // stays valid; every other device/browser is logged out.
    const currentToken = request.cookies.get(SESSION_COOKIE)?.value ?? null;
    const revoked = await revokeOtherSessionsForUser(session.id, currentToken);
    return NextResponse.json({ success: true, revoked });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
