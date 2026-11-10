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
import { checkRateLimit, loginRateLimitKey } from '@/lib/rate-limit';
import { recordLoginEvent } from '@/lib/db/login-events';
import { requestEmailVerification } from '@/lib/services/email-verification-service';

/** Login-event recording is best-effort: it must never block a sign-in. */
async function safeRecordLoginEvent(input: Parameters<typeof recordLoginEvent>[0]): Promise<void> {
  try {
    await recordLoginEvent(input);
  } catch (e) {
    console.error('Failed to record login event', e);
  }
}

/**
 * POST /api/auth — login / register / logout / change-password.
 *
 * Security rules enforced here (not only in the UI):
 * - All inputs validated server-side with Zod; role can never be chosen
 *   by the caller (registration always creates a student).
 * - Login errors are generic: the same message for unknown email, wrong
 *   password, or suspended account.
 * - Login is rate-limited (5 attempts / 15 min per IP + email, in-memory;
 *   Upstash Redis is still pending — see RUNBOOK.md).
 * - Sessions are opaque tokens validated server-side (see lib/auth.ts).
 */

const loginSchema = z.object({
  action: z.literal('login'),
  email: z.string().min(1),
  password: z.string().min(1),
});

const registerSchema = z.object({
  action: z.literal('register'),
  name: z.string().min(1),
  email: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(1),
  confirmPassword: z.string().optional(),
});

const logoutSchema = z.object({ action: z.literal('logout') });

const changePasswordSchema = z.object({
  action: z.literal('change-password'),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

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
    const { email, password } = parsed.data;
    const ip = clientIp(request);
    const limit = checkRateLimit(
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
      // Generic on purpose — never reveal whether the email exists.
      await safeRecordLoginEvent({
        email,
        success: false,
        ip,
        userAgent: request.headers.get('user-agent') ?? undefined,
      });
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
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
    const response = NextResponse.json({ user, success: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
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
    const result = await registerUser({ name, email, phone, password });
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
      return NextResponse.json(
        { error: 'Account created. Please sign in.', verificationEmailSent },
        { status: 201 },
      );
    }
    const token = await createSession(created.id, {
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });
    const response = NextResponse.json(
      { user: created, success: true, verificationEmailSent },
      { status: 201 },
    );
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  }

  if (action === 'logout') {
    const parsed = logoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    await destroySession();
    const response = NextResponse.json({ success: true });
    response.cookies.delete(SESSION_COOKIE);
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
    const { currentPassword, newPassword } = parsed.data;
    const result = await changePassword(session.id, currentPassword, newPassword);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
    return response;
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
