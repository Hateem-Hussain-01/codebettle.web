/**
 * Test-only helper: run a callback inside a faked Next.js request store
 * so route handlers that read `cookies()` from `next/headers`
 * (notably `getSession()` in lib/auth.ts) work when invoked directly
 * in a test.
 *
 * Why this exists: `cookies()` throws "was called outside a request
 * scope" when a route handler is called directly, because there is no
 * request store. Next's stores are `AsyncLocalStorage` instances that
 * read `globalThis.AsyncLocalStorage` ONCE, at first import (the Next
 * server runtime sets that global; the tsx test runner does not), so
 * this module MUST be imported before any module that loads
 * `next/headers` or a route handler — it sets the global first, then
 * loads the storage modules with `createRequire` (static imports would
 * hoist above the assignment and load the fakes instead).
 *
 * The faked store is minimal but faithful: type 'request', phase
 * 'render' (so `cookies()` returns the request's cookies read-only),
 * with a real `RequestCookies` parsed from the given Cookie header.
 * Production code never imports this file.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';

// Set before any Next module loads — see the header comment.
(globalThis as unknown as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??=
  AsyncLocalStorage;

const require = createRequire(import.meta.url);
const { workAsyncStorage } = require(
  'next/dist/server/app-render/work-async-storage.external',
) as {
  workAsyncStorage: { run<T>(store: object, fn: () => T): T };
};
const { workUnitAsyncStorage } = require(
  'next/dist/server/app-render/work-unit-async-storage.external',
) as {
  workUnitAsyncStorage: { run<T>(store: object, fn: () => T): T };
};
const { RequestCookies } = require(
  'next/dist/server/web/spec-extension/cookies',
) as {
  RequestCookies: new (headers: Headers) => { get(name: string): { value: string } | undefined };
};

/** Run `fn` with `cookies()` reading from the given Cookie header. */
export async function withRequestCookies<T>(
  cookieHeader: string,
  fn: () => Promise<T>,
): Promise<T> {
  const cookies = new RequestCookies(
    new Headers(cookieHeader ? { cookie: cookieHeader } : {}),
  );
  return workAsyncStorage.run({}, () =>
    workUnitAsyncStorage.run(
      { type: 'request', phase: 'render', cookies },
      fn,
    ),
  );
}
