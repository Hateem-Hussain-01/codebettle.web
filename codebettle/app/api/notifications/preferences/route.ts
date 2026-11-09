import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireSession } from '@/lib/api-helpers';
import { getUserNotificationPrefs, updateUserNotificationPrefs } from '@/lib/db/users';
import {
  NOTIFICATION_EVENT_KEYS,
  type NotificationEventKey,
  type NotificationPrefs,
} from '@/lib/db/types';

/**
 * GET /api/notifications/preferences — the signed-in user's own
 * notification preferences (defaults when never set).
 * PUT /api/notifications/preferences — replace/merge the signed-in
 * user's own preferences. Shape is validated strictly: only the known
 * keys (inApp, email, events + the five event keys), booleans only.
 * Unknown keys or non-boolean values are rejected with 400.
 */

const TOP_LEVEL_KEYS = ['inApp', 'email', 'events'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate a PUT body; returns the merged prefs or an error message. */
function parsePreferencesBody(
  body: unknown,
  current: NotificationPrefs,
): { prefs: NotificationPrefs } | { error: string } {
  if (!isPlainObject(body)) return { error: 'Preferences must be an object' };
  for (const key of Object.keys(body)) {
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      return { error: `Unknown preference key: ${key}` };
    }
  }
  const merged: NotificationPrefs = {
    inApp: current.inApp,
    email: current.email,
    events: { ...current.events },
  };
  if (body.inApp !== undefined) {
    if (typeof body.inApp !== 'boolean') return { error: 'inApp must be a boolean' };
    merged.inApp = body.inApp;
  }
  if (body.email !== undefined) {
    if (typeof body.email !== 'boolean') return { error: 'email must be a boolean' };
    merged.email = body.email;
  }
  if (body.events !== undefined) {
    if (!isPlainObject(body.events)) return { error: 'events must be an object' };
    for (const key of Object.keys(body.events)) {
      if (!(NOTIFICATION_EVENT_KEYS as readonly string[]).includes(key)) {
        return { error: `Unknown event key: ${key}` };
      }
      const value = (body.events as Record<string, unknown>)[key];
      if (typeof value !== 'boolean') return { error: `events.${key} must be a boolean` };
      merged.events[key as NotificationEventKey] = value;
    }
  }
  return { prefs: merged };
}

export async function GET() {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const prefs = await getUserNotificationPrefs(auth.session.id);
  if (!prefs) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  return NextResponse.json({ preferences: prefs });
}

export async function PUT(request: NextRequest) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const current = await getUserNotificationPrefs(auth.session.id);
  if (!current) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const parsed = parsePreferencesBody(body, current);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const saved = await updateUserNotificationPrefs(auth.session.id, parsed.prefs);
  if (!saved) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  return NextResponse.json({ preferences: saved });
}
