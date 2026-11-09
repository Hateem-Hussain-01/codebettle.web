/**
 * Database client seam (Phase 2).
 *
 * All repositories go through getDb() — never import the client directly.
 * In production getDb() returns the real Prisma client from
 * src/prisma/db.ts. Tests swap in an in-memory fake via __setDbClient
 * (tests/fake-db.ts); the cast there is test-only. Never call the
 * __setDbClient/__resetDbClient hooks in application code.
 *
 * The client itself is lazy: constructing it does not open a connection
 * (verified: it builds fine with DATABASE_URL unset). A connection is
 * opened on the first query, so `next build` and `tsc` never touch the
 * database. Pages that read from the DB must still avoid prerendering
 * (see `await connection()` in server pages), because a prerender
 * attempt WOULD open a connection and fail the build where no DB exists.
 */
import { db } from '../../src/prisma/db';

export type DbClient = typeof db;

let current: DbClient = db;

export function getDb(): DbClient {
  return current;
}

/** Test hook: swap the client for an in-memory fake. Never call in production code. */
export function __setDbClient(client: DbClient): void {
  current = client;
}

/** Test hook: restore the real client. Never call in production code. */
export function __resetDbClient(): void {
  current = db;
}
