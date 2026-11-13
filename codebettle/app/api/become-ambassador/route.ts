import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, becomeAmbassadorRateLimitKey } from '@/lib/rate-limit';
import {
  createAmbassadorApplication,
  AMBASSADOR_APPLICATION_TABLE_MISSING_MESSAGE,
} from '@/lib/db/ambassador-applications';

/**
 * POST /api/become-ambassador — campus ambassador application (PR #33).
 *
 * Public: no auth, rate-limited (5 per 15 minutes per IP). EXACT
 * fields from Eman's Google Form 'CodeBettle Ambassador' (13 Nov 2026
 * ~22:19 PKT) — all 8 required: Name, WhatsApp, Email, University /
 * Institute Name, Department & Semester (ONE field), leadership
 * position (radio: Class Representative (CR), Girls Representative
 * (GR), Society Executive, None / General Student), promotion plan
 * (long text), prior ambassador experience (Yes/No). Server-side
 * validation enforces all of them (email format, WhatsApp as a phone
 * number, exact radio options). Until the AmbassadorApplication table
 * exists (Eman runs codebettle-footer-bookcall-migration.sql),
 * returns 503.
 */
const LEADERSHIP_POSITIONS = [
  'Class Representative (CR)',
  'Girls Representative (GR)',
  'Society Executive',
  'None / General Student',
] as const;

const ambassadorSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required').max(100),
  whatsapp: z
    .string()
    .trim()
    .min(1, 'WhatsApp number is required')
    .max(30)
    .regex(/^[+0-9][0-9\s-]*$/, 'Enter a valid WhatsApp number'),
  email: z.string().trim().email('A valid email address is required').max(200),
  university: z.string().trim().min(1, 'University / Institute Name is required').max(200),
  departmentSemester: z.string().trim().min(1, 'Department & Semester is required').max(200),
  leadershipPosition: z.enum(LEADERSHIP_POSITIONS, {
    message: 'Please choose a leadership position',
  }),
  promotionPlan: z.string().trim().min(1, 'Please tell us how you plan to promote CodeBettle').max(5000),
  priorAmbassadorExperience: z.enum(['Yes', 'No'], {
    message: 'Please tell us whether you have done campus ambassador work before',
  }),
});

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(becomeAmbassadorRateLimitKey(clientIp(request)), 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many applications. Please try again later.' },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = ambassadorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid application' }, { status: 400 });
  }
  try {
    const application = await createAmbassadorApplication({
      fullName: parsed.data.fullName,
      whatsapp: parsed.data.whatsapp,
      email: parsed.data.email,
      university: parsed.data.university,
      departmentSemester: parsed.data.departmentSemester,
      leadershipPosition: parsed.data.leadershipPosition,
      promotionPlan: parsed.data.promotionPlan,
      priorAmbassadorExperience: parsed.data.priorAmbassadorExperience,
    });
    return NextResponse.json({ ok: true, application }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === AMBASSADOR_APPLICATION_TABLE_MISSING_MESSAGE) {
      return NextResponse.json(
        { error: 'Ambassador applications are not set up yet. Please try again later.' },
        { status: 503 },
      );
    }
    console.error('[become-ambassador] Failed to save application:', error);
    return NextResponse.json({ error: 'Could not save your application. Please try again later.' }, { status: 500 });
  }
}
