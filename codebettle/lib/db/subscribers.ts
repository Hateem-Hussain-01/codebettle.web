/**
 * Subscriber repository (footer newsletter, PR #33).
 *
 * One row per email; the footer Subscribe form posts to
 * /api/subscribe and admins list subscribers in the Subscribers
 * section. Unsubscribe is a delete. Subscribing twice is idempotent
 * (returns the existing row) — the footer never shows an error for
 * an already-subscribed email.
 *
 * FAIL-SAFE (same shape as lib/db/batches.ts): the Subscriber table
 * arrives via migration 20261113T1847_add_footer_bookcall_ambassador,
 * which Eman runs himself in the Supabase SQL Editor. Until it runs,
 * reads return empty (the footer shows a "run the SQL" state) and
 * writes return a clear error telling the admin to run the SQL first.
 */
import { getDb } from './client';
import { mapSubscriberRow } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type { Subscriber } from './types';

/** True when the error is "relation does not exist" for the Subscriber table (migration not run yet). */
export function isMissingSubscriberTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  const namesSubscriber = text.includes('Subscriber');
  if (code === '42P01' && namesSubscriber) return true;
  return /relation .* does not exist/i.test(text) && namesSubscriber;
}

export const SUBSCRIBER_TABLE_MISSING_MESSAGE =
  'The Subscriber table is not set up yet — run codebettle-footer-bookcall-migration.sql in the Supabase SQL Editor first.';

/** Cheap probe: true when the table exists (migration has run). */
export async function isSubscriberTableReady(): Promise<boolean> {
  try {
    await getDb().orm.public.Subscriber.orderBy((s) => s.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isMissingSubscriberTableError(error)) return false;
    throw error;
  }
}

/** A read that returns the fallback when the table is missing, instead of throwing. */
async function withSubscriberTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingSubscriberTableError(error)) return fallback;
    throw error;
  }
}

function throwIfTableMissing(error: unknown): never {
  if (isMissingSubscriberTableError(error)) {
    throw new Error(SUBSCRIBER_TABLE_MISSING_MESSAGE);
  }
  throw error;
}

/** Subscribe an email. Idempotent: an already-subscribed email returns the existing row. */
export async function createSubscriber(email: string): Promise<Subscriber> {
  const normalized = email.trim().toLowerCase();
  try {
    const existing = await getDb().orm.public.Subscriber.where({ email: normalized }).first();
    if (existing) return mapSubscriberRow(existing);
    const row = await getDb().orm.public.Subscriber.create({ email: normalized });
    return mapSubscriberRow(row);
  } catch (error) {
    // Unique-violation race (two concurrent subscribes): re-read the row.
    const code = (error as { code?: unknown }).code;
    if (code === '23505') {
      const existing = await getDb().orm.public.Subscriber.where({ email: normalized }).first();
      if (existing) return mapSubscriberRow(existing);
    }
    throwIfTableMissing(error);
  }
}

export interface ListSubscribersOptions {
  page?: string | string[];
  limit?: string | string[];
}

/** Newest first, paginated (admin Subscribers section). */
export async function listSubscribers(opts: ListSubscribersOptions = {}): Promise<Page<Subscriber>> {
  return withSubscriberTableFallback(async () => {
    const params = parsePageParams({ page: opts.page, limit: opts.limit });
    const query = getDb().orm.public.Subscriber;
    const total = (await query.all()).length;
    const rows = await query.orderBy((s) => s.createdAt.desc()).limit(params.limit).offset(params.offset).all();
    return toPage(rows.map(mapSubscriberRow), total, params);
  }, toPage<Subscriber>([], 0, parsePageParams({ page: opts.page, limit: opts.limit })));
}

export async function deleteSubscriber(id: string): Promise<boolean> {
  try {
    const row = await getDb().orm.public.Subscriber.where({ id }).first();
    if (!row) return false;
    await getDb().orm.public.Subscriber.where({ id }).delete();
    return true;
  } catch (error) {
    throwIfTableMissing(error);
  }
}
