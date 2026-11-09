import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { completeFirstRunSetup, getSetupStatus } from '@/lib/services/first-run';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/auth/setup — which official admin accounts are claimed (no sensitive data).
 * POST /api/auth/setup — claim one official admin account (first-run setup, master prompt §8).
 *
 * Only the two approved emails can be claimed (Muhammad Hateem Hussain,
 * COO, and Ahmad Hassan, CEO). The admin chooses their own password; it
 * is bcrypt-hashed before storage and never written anywhere. Once both
 * accounts exist, setup is closed and the setup page redirects to login.
 * Rate-limited (5 attempts / 15 min per IP) like login.
 */

export async function GET() {
  const status = await getSetupStatus();
  return NextResponse.json(status);
}

const setupSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  confirmPassword: z.string().optional(),
});

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

export async function POST(request: NextRequest) {
  const status = await getSetupStatus();
  if (status.complete) {
    return NextResponse.json({ error: 'Setup is already complete' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }
  const { email, password, confirmPassword } = parsed.data;
  if (confirmPassword !== undefined && confirmPassword !== password) {
    return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
  }

  const limit = checkRateLimit(`setup:${clientIp(request)}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many setup attempts. Please try again later.' },
      { status: 429 },
    );
  }

  const result = await completeFirstRunSetup(email, password);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ user: result.user }, { status: 201 });
}
